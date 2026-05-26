# Go Builder Image - Isolated build environment for contestant submissions
FROM golang:1.22-alpine AS builder

# Install git for go modules that require VCS
RUN apk add --no-cache git ca-certificates

# Create a non-root user for building
RUN addgroup -S buildgroup && adduser -S builduser -G buildgroup

WORKDIR /build

# Copy source code (mounted at runtime by the sandbox service)
COPY . .

# Build the submission
RUN go mod tidy && go build -o /output/engine ./...

# --- Final minimal runner stage ---
FROM scratch
COPY --from=builder /output/engine /engine
ENTRYPOINT ["/engine"]
