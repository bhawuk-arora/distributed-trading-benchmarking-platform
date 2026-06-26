# Distributed Trading Benchmarking & Hosting Platform

A production-grade, cloud-native benchmarking and hosting platform designed to sandbox and evaluate high-frequency trading (HFT) engines under concurrent, high-throughput market load.

---

## Repository Structure

Following production-level separation of concerns, the monorepo is organized as follows:

```text
├── backend/            # Go HFT matching engine, leaderboard APIs, & submission sandboxes
├── frontend/           # React / Next.js web dashboard (real-time standings & submit portal)
├── infrastructure/     # AWS EKS Terraform code, Docker Compose files, & Helm charts
└── scripts/            # Automation scripts for local verification & demos
```

---

## 1. Local Quickstart (End-to-End Demo)

You can run the entire platform locally in one command. Make sure Docker Desktop is active:

1. Execute the automated local runner:
   ```powershell
   .\scripts\run_local_demo.ps1
   ```
   *This script spins up Redis/Timescale/Redpanda, launches the Matching Engine and Leaderboard, triggers a 15-second load test, and opens the Next.js dashboard.*

2. Access the dashboards:
   * **Leaderboard Dashboard:** [http://localhost:8282](http://localhost:8282) (serves compiled Next.js build)
   * **Prometheus UI:** [http://localhost:9090](http://localhost:9090)
   * **Grafana Dashboards:** [http://localhost:3000](http://localhost:3000) (User/Pass: `admin` / `admin`)

---

## 2. Developer Workflow (Frontend & Backend Sync)

The `leaderboard-service` serves the production dashboard assets statically from `backend/web`.

If you modify the Next.js code inside `/frontend`:
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Build and export the Next.js static files to the Go backend folder:
   ```bash
   npm run export
   ```
3. Run the Go leaderboard service:
   ```bash
   cd ../backend
   go run ./cmd/leaderboard-service --port 8282
   ```

---

## 3. Production Hosting & Subdomain Routing (AWS EKS)

Production deployment is packaged via Terraform and Helm charts.

### Step A: Provision AWS Infrastructure
1. Configure your AWS credentials in your terminal.
2. Initialize and deploy the Terraform stack (VPC, EKS, RDS PostgreSQL, ElastiCache Redis):
   ```bash
   cd infrastructure/deploy/terraform
   terraform init
   terraform apply
   ```
3. Update your local kubeconfig to point to EKS:
   ```bash
   aws eks update-kubeconfig --region us-east-1 --name trading-bench-cluster
   ```

### Step B: Setup DNS Subdomain
* Point your subdomain A/CNAME record (e.g. `dash.yourdomain.com`) to the AWS Network Load Balancer (NLB) created by the Kubernetes Ingress Controller.

### Step C: Deploy Helm Charts
1. Update `infrastructure/deploy/helm/matching-platform/values.yaml` with your database endpoints and subdomain hosts.
2. Install the Helm chart:
   ```bash
   helm install matching-platform ./infrastructure/deploy/helm/matching-platform
   ```

---

## 4. CI/CD Infrastructure Pipeline
The pipeline is defined in [.github/workflows/infra.yml](file:///.github/workflows/infra.yml). 
* **Trigger:** Manually triggered (`workflow_dispatch`) from the GitHub Actions tab.
* **Requirements:** Set up GitHub secrets for `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `DB_PASSWORD`.
