package sandbox

import (
	"archive/tar"
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

// DockerExecutor wraps the Docker SDK to manage sandbox container lifecycles.
type DockerExecutor struct {
	cli *client.Client
}

// NewDockerExecutor creates a new DockerExecutor connected to the local Docker daemon.
func NewDockerExecutor() (*DockerExecutor, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Docker daemon: %w", err)
	}
	return &DockerExecutor{cli: cli}, nil
}

// RunSandbox launches a contestant engine in a fully locked-down container.
// Security constraints applied:
//   - No network access (--network none)
//   - Read-only root filesystem
//   - Memory limit: 512MB
//   - CPU limit: 1 core
//   - No new privileges (no privilege escalation)
//   - All Linux capabilities dropped
func (d *DockerExecutor) RunSandbox(ctx context.Context, imageName string, port string) (string, error) {
	log.Printf("[sandbox] Launching container from image: %s", imageName)

	resp, err := d.cli.ContainerCreate(ctx,
		&container.Config{
			Image: imageName,
			Env:   []string{fmt.Sprintf("PORT=%s", port)},
		},
		&container.HostConfig{
			NetworkMode:  "none", // No internet access
			ReadonlyRootfs: true,
			Resources: container.Resources{
				Memory:   512 * 1024 * 1024, // 512MB
				NanoCPUs: 1_000_000_000,     // 1 CPU core
			},
			SecurityOpt: []string{"no-new-privileges:true"},
			CapDrop:     []string{"ALL"},
		},
		nil, nil, "",
	)
	if err != nil {
		return "", fmt.Errorf("failed to create container: %w", err)
	}

	containerID := resp.ID
	log.Printf("[sandbox] Container created: %s", containerID[:12])

	if err := d.cli.ContainerStart(ctx, containerID, container.StartOptions{}); err != nil {
		return "", fmt.Errorf("failed to start container: %w", err)
	}

	log.Printf("[sandbox] Container started: %s", containerID[:12])
	return containerID, nil
}

// StopAndRemove stops and removes a running sandbox container.
func (d *DockerExecutor) StopAndRemove(ctx context.Context, containerID string) error {
	log.Printf("[sandbox] Stopping container: %s", containerID[:12])
	timeout := 5
	if err := d.cli.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &timeout}); err != nil {
		log.Printf("[sandbox] Warning: could not stop container %s: %v", containerID[:12], err)
	}
	return d.cli.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true})
}

// GetLogs retrieves logs from a container (useful for build failures).
func (d *DockerExecutor) GetLogs(ctx context.Context, containerID string) (string, error) {
	out, err := d.cli.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
	})
	if err != nil {
		return "", err
	}
	defer out.Close()

	buf := new(bytes.Buffer)
	io.Copy(buf, out)
	return buf.String(), nil
}

// BuildImage builds a Docker image from a Dockerfile path and source directory.
func (d *DockerExecutor) BuildImage(ctx context.Context, srcDir string, dockerfilePath string, imageTag string) error {
	log.Printf("[sandbox] Building image %s from %s", imageTag, srcDir)

	// Create a tar archive of the build context
	buf := new(bytes.Buffer)
	tw := tar.NewWriter(buf)
	defer tw.Close()

	if err := addDirToTar(tw, srcDir, "."); err != nil {
		return fmt.Errorf("failed to create build context tar: %w", err)
	}

	buildCtx := bytes.NewReader(buf.Bytes())
	opts := types.ImageBuildOptions{
		Tags:       []string{imageTag},
		Dockerfile: dockerfilePath,
		Remove:     true,
	}

	_ = image.PullOptions{} // ensure image package is used
	resp, err := d.cli.ImageBuild(ctx, buildCtx, opts)
	if err != nil {
		return fmt.Errorf("docker build failed: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body) // consume output
	return nil
}

// addDirToTar recursively adds a directory to a tar writer.
func addDirToTar(tw *tar.Writer, srcDir string, baseInTar string) error {
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := srcDir + "/" + entry.Name()
		tarPath := baseInTar + "/" + entry.Name()
		if entry.IsDir() {
			if err := addDirToTar(tw, srcPath, tarPath); err != nil {
				return err
			}
		} else {
			data, err := os.ReadFile(srcPath)
			if err != nil {
				return err
			}
			hdr := &tar.Header{
				Name: tarPath,
				Mode: 0644,
				Size: int64(len(data)),
			}
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			if _, err := tw.Write(data); err != nil {
				return err
			}
		}
	}
	return nil
}
