# QuMail (Quantum Mail)

QuMail is a cutting-edge web application that leverages modern cryptographic paradigms alongside traditional email protocols to provide secure, post-quantum protected messaging. This repository contains both the React-based frontend and the Python-based backend that power the Quantum Mail experience.

## ✨ Project Structure

The project has been organized professionally into distinct layers to separate concerns:

```text
QuMail/
├── backend/                       # Python Backend (formerly 'Quantum Mail')
│   ├── backend.py                 # Core backend endpoints/logic
│   ├── gmail_auth.py              # Gmail OAuth2 handling
│   ├── kme_server.py              # Key Management execution and setup
│   ├── (Sensitive Configs)        # client_secret.json, kme_keys.json, etc. (ignored in Git)
│   └── ...                        # Other python modules
├── src/                           # React Vite Frontend Source Code
├── public/                        # Static assets
├── package.json                   # Frontend dependencies
├── tailwind.config.js             # Styling configuration
└── README.md                      # Project documentation
```

---

## 🚀 How to Run the Project Locally

### 1. Prerequisite Setup
Make sure you have installed:
- [Node.js](https://nodejs.org/en/) (v16 or higher)
- [Python](https://www.python.org/) (v3.9 or higher)
- `pip` for Python packages

### 2. Configure Credentials (Important!)
Since credentials should **never** be pushed to Git, you need to manually add them to the `backend/` folder on any new machine you clone this onto.

Ensure the following files are placed inside the `backend/` directory:
- `client_secret.json`: Your Google OAuth2 Client Secrets.
- `kme_keys.json`: Your Quantum Key Management configuration.
- `token.json` (will be generated after your first authentication).

**Note:** All of these sensitive files are already tracked in `.gitignore` to prevent accidental leaks.

### 3. Run the Backend (Python)
Open a terminal and navigate to the backend folder:
```bash
cd backend
```
Install the required packages (replace with your actual required packages):
```bash
pip install -r requirements.txt # (if available) or pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib flask
```
Start the python backend service:
```bash
python -m uvicorn kme_server:app --host 0.0.0.0 --port 8443
python -m uvicorn mock_digilocker:app --host 0.0.0.0 --port 8444
python -m uvicorn backend:app --host 127.0.0.1 --port 8000
```

### 4. Run the Frontend (React + Vite)
Open a **new** terminal in the root directory:
```bash
# Install NPM dependencies
npm install

# Start the Vite development server
npm run dev
```
The frontend should now be running (usually on http://localhost:5173).

---

## 🛠️ Pushing to Git

This repository is pre-configured to ignore all your sensitive keys and API secrets automatically (via the updated `.gitignore`). To push your code safely to a repository (like GitHub, GitLab, or Bitbucket), follow these steps:

**1. Initialize Git (If not already initialized)**
```bash
git init
```

**2. Add & Commit your Code**
```bash
# Stage all changes (your sensitive files will be automatically ignored)
git add .

# Create a commit
git commit -m "chore: restructure project and add documentation"
```

**3. Link & Push to your remote repository**
*(Replace `YOUR_REPO_URL` with your actual Git URL, e.g., `https://github.com/username/qumail.git`)*
```bash
# Link the remote repository
git remote add origin YOUR_REPO_URL

# Push the code to the main branch
git branch -M main
git push -u origin main
```

---

## 🔐 Best Practices

- **Never Commit Sensitive Files**: Files containing API Keys, `client_secret.json`, Private Keys, or `.env` files should always remain local.
- **Dependency Tracking**: Always run `pip freeze > requirements.txt` so other developers can install the exact python dependencies.
- **Branching**: For future updates, consider creating feature branches instead of pushing straight to `main` (`git checkout -b feature-name`).
