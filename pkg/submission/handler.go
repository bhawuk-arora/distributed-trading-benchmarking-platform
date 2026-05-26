package submission

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// SubmissionStatus tracks the lifecycle of a submission.
type SubmissionStatus string

const (
	StatusPending   SubmissionStatus = "PENDING"
	StatusCompiling SubmissionStatus = "COMPILING"
	StatusSuccess   SubmissionStatus = "SUCCESS"
	StatusFailed    SubmissionStatus = "FAILED"
)

// Submission represents a single contestant engine submission.
type Submission struct {
	ID           string           `json:"id"`
	ContestantID string           `json:"contestant_id"`
	Status       SubmissionStatus `json:"status"`
	ImageTag     string           `json:"image_tag,omitempty"`
	Logs         string           `json:"logs,omitempty"`
	CreatedAt    time.Time        `json:"created_at"`
}

// Store is a simple in-memory store for submissions (replaced by Postgres in Phase 7+).
type Store struct {
	mu   sync.RWMutex
	data map[string]*Submission
}

func NewStore() *Store {
	return &Store{data: make(map[string]*Submission)}
}

func (s *Store) Save(sub *Submission) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[sub.ID] = sub
}

func (s *Store) Get(id string) (*Submission, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sub, ok := s.data[id]
	return sub, ok
}

// Handler handles all submission REST API endpoints.
type Handler struct {
	store   *Store
	uploadDir string
}

// NewHandler creates a new submission handler.
func NewHandler(uploadDir string) *Handler {
	os.MkdirAll(uploadDir, 0755)
	return &Handler{
		store:   NewStore(),
		uploadDir: uploadDir,
	}
}

// RegisterRoutes binds all submission API routes.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/submissions", h.handleUpload)
	mux.HandleFunc("GET /api/v1/submissions/", h.handleGetStatus)
	mux.HandleFunc("POST /api/v1/submissions/git", h.handleGitSubmission)
}

// handleUpload accepts a zip/tar file upload of contestant source code.
func (h *Handler) handleUpload(w http.ResponseWriter, r *http.Request) {
	contestantID := r.Header.Get("X-Contestant-ID")
	if contestantID == "" {
		http.Error(w, "missing X-Contestant-ID header", http.StatusBadRequest)
		return
	}

	r.ParseMultipartForm(50 << 20) // 50MB max
	file, header, err := r.FormFile("source")
	if err != nil {
		http.Error(w, "missing source file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	sub := &Submission{
		ID:           uuid.New().String(),
		ContestantID: contestantID,
		Status:       StatusPending,
		CreatedAt:    time.Now(),
	}
	h.store.Save(sub)

	// Save uploaded file
	destPath := filepath.Join(h.uploadDir, sub.ID+filepath.Ext(header.Filename))
	dest, err := os.Create(destPath)
	if err != nil {
		http.Error(w, "could not save file", http.StatusInternalServerError)
		return
	}
	defer dest.Close()
	io.Copy(dest, file)

	log.Printf("[submission] Received upload for contestant %s → submission %s", contestantID, sub.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(sub)
}

// handleGitSubmission accepts a Git repo URL and clones it.
func (h *Handler) handleGitSubmission(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ContestantID string `json:"contestant_id"`
		GitURL       string `json:"git_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.GitURL == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	sub := &Submission{
		ID:           uuid.New().String(),
		ContestantID: body.ContestantID,
		Status:       StatusPending,
		CreatedAt:    time.Now(),
	}
	h.store.Save(sub)

	// Clone the repo in the background
	destDir := filepath.Join(h.uploadDir, sub.ID)
	go func() {
		sub.Status = StatusCompiling
		h.store.Save(sub)

		log.Printf("[submission] Cloning %s → %s", body.GitURL, destDir)
		cmd := exec.Command("git", "clone", "--depth=1", body.GitURL, destDir)
		out, err := cmd.CombinedOutput()
		if err != nil {
			sub.Status = StatusFailed
			sub.Logs = fmt.Sprintf("git clone failed: %s\n%s", err.Error(), string(out))
			log.Printf("[submission] Clone failed: %s", sub.Logs)
		} else {
			sub.Status = StatusSuccess
			sub.Logs = string(out)
			log.Printf("[submission] Clone succeeded for %s", sub.ID)
		}
		h.store.Save(sub)
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(sub)
}

// handleGetStatus returns the current status of a submission.
func (h *Handler) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	// Path: /api/v1/submissions/{id}
	id := filepath.Base(r.URL.Path)
	sub, ok := h.store.Get(id)
	if !ok {
		http.Error(w, "submission not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sub)
}
