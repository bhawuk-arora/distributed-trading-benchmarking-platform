package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"distributed-trading-benchmarking-platform/pkg/sandbox"
	"distributed-trading-benchmarking-platform/pkg/submission"
)

func main() {
	port := flag.String("port", "9090", "Port to run the submission service on")
	uploadDir := flag.String("upload-dir", "./uploads", "Directory to store uploaded submissions")
	flag.Parse()

	log.Printf("Starting Submission Service on port %s...", *port)

	// Initialise Docker executor (connects to local Docker daemon)
	executor, err := sandbox.NewDockerExecutor()
	if err != nil {
		log.Printf("WARNING: Docker daemon not available: %v", err)
		log.Println("Sandbox execution will be unavailable. Upload and Git clone still functional.")
	} else {
		log.Println("Connected to Docker daemon successfully.")
		_ = executor // will be wired to build jobs in Phase 5+
	}

	// Initialise submission handler
	handler := submission.NewHandler(*uploadDir)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	// Health check endpoint
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	srv := &http.Server{
		Addr:         ":" + *port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	shutdownSig := make(chan os.Signal, 1)
	signal.Notify(shutdownSig, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe error: %v", err)
		}
	}()

	log.Printf("Submission Service running on :%s. Press CTRL+C to stop.", *port)
	<-shutdownSig

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	log.Println("Submission Service stopped.")
}
