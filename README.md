# Ubuzima Connect — AI-Powered Chest X-Ray Diagnosis System

 A web-based clinical decision support tool that helps radiologists in Rwanda detect Tuberculosis, Pneumonia, and Normal chest conditions from X-ray images using deep learning.


## Demo Video

<!-- Replace the link below with your YouTube or Google Drive video link -->
> **[Watch the 5-minute Demo Video here](https://your-youtube-or-drive-link-here)**


## Live Deployment

| Service | URL |
|---|---|
| Web App | https://ubuzimaconnect.vercel.app |
| Backend API Docs | https://leslylezoo-ubuzima-backend.hf.space/docs |
| AI Model | https://huggingface.co/leslylezoo/ubuzima-model/tree/main |


## Screenshots

> Screenshots are in the [`screenshots/`](./screenshots/) folder.

### Landing Page
![Landing Page](screenshots/landing.png)

### Radiologist Registration
![Registration Form](screenshots/registration.png)

### Admin — Pending Approvals
![Admin Approvals](screenshots/admin_approvals.png)

### Radiologist Dashboard
![Radiologist Dashboard](screenshots/dashboard.png)

### Patient Diagnosis Form
![Diagnosis Form](screenshots/diagnosis_form.png)

### AI Diagnosis Result with Grad-CAM Heatmap
![Diagnosis Result](screenshots/diagnosis_result.png)

### Admin — All Predictions
![Admin Predictions](screenshots/admin_predictions.png)

### Admin — Patient Records
![Admin Patients](screenshots/admin_patients.png)


## What It Does

Ubuzima Connect allows hospital radiologists to upload chest X-ray images and receive instant AI predictions for:

- Tuberculosis (TB)
- Pneumonia
- Normal (healthy)
- Unknown / inconclusive

Each prediction includes a confidence score, probability breakdown, and a Grad-CAM heatmap highlighting the regions of the X-ray that influenced the diagnosis. Radiologists can then verify or override the AI result before it is saved.


## Features

| Feature | Description |
|---|---|
| AI Diagnosis | Deep learning model (TensorFlow/Keras) classifies chest X-rays |
| Multi-image Upload | Upload multiple X-rays per patient session |
| Grad-CAM Heatmaps | Visual explanation of AI decision |
| Radiologist Verification | Doctors can confirm, override, or add notes to results |
| Patient Management | Register patients with name, national ID, age, sex |
| Admin Dashboard | Manage radiologists, view all diagnoses, approve accounts |
| Secure Auth | Supabase JWT authentication with password reset via email |
| Role-based Access | Admin and Radiologist roles with separate dashboards |


## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI (Python) |
| AI Model | TensorFlow 2.x / Keras (CNN) |
| Database | PostgreSQL via Supabase |
| Authentication | Supabase Auth (JWT) |
| Frontend Hosting | Vercel |
| Backend Hosting | Hugging Face Spaces (Docker) |
| Model Storage | Hugging Face Hub |


## Project Structure

```
ubuzima/
├── backend/
│   ├── main.py                          # FastAPI application (all endpoints)
│   ├── Dockerfile                       # Docker config for HF Spaces deployment
│   ├── requirements.txt                 # Python dependencies
│   ├── start.sh                         # Model download + server startup script
│   └── .env                             # Environment variables (never commit this)
├── frontend/
│   ├── App.tsx                          # Root app with React Router
│   ├── index.tsx                        # Entry point
│   ├── index.html                       # HTML shell
│   ├── vite.config.ts                   # Vite config
│   ├── vercel.json                      # SPA routing fix for Vercel
│   ├── package.json                     # Frontend dependencies
│   ├── components/
│   │   ├── Dashboard.tsx                # Radiologist dashboard
│   │   ├── AdminDashboard.tsx           # Admin panel
│   │   ├── AuthPage.tsx                 # Login & registration
│   │   └── supabaseConfig.ts            # Supabase client setup
│   ├── notebooks/
│   │   └── Ubuzima_Connect_notebook.ipynb  # Model training notebook (Google Colab)
│   └── src/
│       └── services/
│           └── api.ts                   # API service layer
├── screenshots/                         # Demo screenshots (see above)
└── README.md
```


## How to Run Locally

### Prerequisites

- Node.js 18+
- Python 3.11
- A Supabase project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/Leslyndizeye/UbuzimaConnect.git
cd UbuzimaConnect
```

### 2. Set up the backend

```bash
cd backend
python -m venv venv
source venv/Scripts/activate   # Windows
# source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt
```

Create a `.env` file in the `backend/` folder with the following variables:

```env
# Database
DATABASE_URL=postgresql://postgres.<your-project-ref>:<your-password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres

# Supabase
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>

# App
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
FRONTEND_URL=http://localhost:3000
MODEL_PATH=models/ubuzima_model_production.keras
```

> Get all Supabase values from your project dashboard at supabase.com → Project Settings → API

Download the AI model:

```bash
mkdir -p models
curl -L "https://huggingface.co/leslylezoo/ubuzima-model/resolve/main/ubuzima_model_production.keras" \
  -o models/ubuzima_model_production.keras
```

Start the backend:

```bash
uvicorn main:app --reload --port 8000
```

### 3. Set up the frontend

```bash
cd ../frontend
npm install
```

Create a `.env` file in the `frontend/` folder:

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Start the frontend:

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.


## How to Use

### As a New Radiologist

1. Go to the app and click **Get Started**
2. Click **Register** and fill in your details (name, email, hospital, license number)
3. Wait for admin approval — you will receive an email with a link to set your password
4. Click the link in the email, set your password, and log in

### Diagnosing a Patient

1. Go to the **Diagnose** tab
2. Enter the patient's full name, Rwanda National ID (16 digits), age, and sex
3. Upload one or more chest X-ray images (drag & drop, click, or paste)
4. Click **Run Diagnosis**
5. Review the AI result, confidence score, probability bars, and Grad-CAM heatmap
6. Verify the result or override if needed, add clinical notes, and save

### As an Admin

1. Log in with your admin account
2. Go to **Users** tab to approve or reject pending radiologist applications
3. Go to **Predictions** tab to view all diagnoses across all radiologists
4. Go to **Patients** tab to see all patient records with full history


## Deployment

### Backend — Hugging Face Spaces

The backend runs as a Docker container on Hugging Face Spaces (free tier, 16GB RAM).

```bash
cd backend
git remote add hf https://huggingface.co/spaces/leslylezoo/ubuzima-backend
git push hf main
```

Set these in HF Space → **Settings → Variables and secrets**:

| Variable | Description |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.<ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | From Supabase → Project Settings → API |
| `SUPABASE_JWT_SECRET` | From Supabase → Project Settings → API |
| `ALLOWED_ORIGINS` | `https://ubuzimaconnect.vercel.app` |

### Frontend — Vercel

The frontend deploys automatically from GitHub via Vercel.

```bash
git push origin main   # Vercel auto-deploys on every push
```

Set these in Vercel → **Project Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://leslylezoo-ubuzima-backend.hf.space` |
| `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | From Supabase → Project Settings → API |


## Training Notebook

The model was trained in Google Colab. The notebook is at:

```
frontend/notebooks/Ubuzima_Connect_notebook.ipynb
```

Open it directly in Colab:

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Leslyndizeye/UbuzimaConnect/blob/main/frontend/notebooks/Ubuzima_Connect_notebook.ipynb)


## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register new radiologist |
| GET | `/auth/me` | Get current user profile |
| POST | `/predict` | Run AI diagnosis on X-ray |
| GET | `/patients` | List patients |
| POST | `/patients` | Create patient |
| GET | `/diagnoses` | List diagnoses |
| PATCH | `/diagnoses/{id}/verify` | Verify or override a diagnosis |
| GET | `/users` | List all users (admin only) |
| PATCH | `/users/{id}/status` | Approve or reject user (admin only) |
| GET | `/health` | Health check |

Full interactive docs: https://leslylezoo-ubuzima-backend.hf.space/docs


## AI Model

- **Framework:** TensorFlow 2.x / Keras
- **Input:** 224×224 RGB chest X-ray image
- **Output:** 4-class softmax (TB, Pneumonia, Normal, Unknown)
- **Explainability:** Grad-CAM heatmaps
- **Size:** 215 MB `.keras` format
- **Repository:** https://huggingface.co/leslylezoo/ubuzima-model/tree/main


