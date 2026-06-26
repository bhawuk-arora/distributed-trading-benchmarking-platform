package sandbox

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// Builder handles building contestant code inside an isolated Docker container.
type Builder struct {
	executor *DockerExecutor
}

// NewBuilder creates a new Builder backed by the given DockerExecutor.
func NewBuilder(executor *DockerExecutor) *Builder {
	return &Builder{executor: executor}
}

// BuildSubmission takes a source directory of contestant code, builds it using
// the builder-go.Dockerfile, and returns the resulting Docker image tag.
func (b *Builder) BuildSubmission(ctx context.Context, submissionID string, srcDir string) (string, error) {
	imageTag := fmt.Sprintf("submission-%s:latest", submissionID)
	dockerfilePath := "Dockerfile"

	// Copy our builder Dockerfile into the source directory so Docker can find it
	builderDockerfile, err := os.ReadFile(filepath.Join("build", "builder-go.Dockerfile"))
	if err != nil {
		return "", fmt.Errorf("could not read builder Dockerfile: %w", err)
	}

	destDockerfile := filepath.Join(srcDir, "Dockerfile")
	if err := os.WriteFile(destDockerfile, builderDockerfile, 0644); err != nil {
		return "", fmt.Errorf("could not write Dockerfile to source dir: %w", err)
	}
	defer os.Remove(destDockerfile) // Clean up after build

	log.Printf("[builder] Building submission %s", submissionID)
	if err := b.executor.BuildImage(ctx, srcDir, dockerfilePath, imageTag); err != nil {
		return "", fmt.Errorf("build failed for submission %s: %w", submissionID, err)
	}

	log.Printf("[builder] Successfully built image: %s", imageTag)
	return imageTag, nil
}
