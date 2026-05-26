# Runner Base Image - Locked-down execution environment for contestant engines
FROM alpine:3.19

# Security hardening:
# - No package manager cache kept
# - No shell available in final image (use distroless or scratch for production)
# - Create a strict non-root user
RUN addgroup -S sandbox && adduser -S sandboxuser -G sandbox

# Drop all capabilities by default - enforced at Docker run time with:
#   --cap-drop=ALL
#   --security-opt=no-new-privileges
#   --read-only
#   --network none
#   --memory=512m
#   --cpus=1.0

USER sandboxuser
WORKDIR /app

# Engine binary will be copied in at build time per submission
COPY --chown=sandboxuser:sandbox engine /app/engine

ENTRYPOINT ["/app/engine"]
