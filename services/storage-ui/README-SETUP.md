# AI Powered File Storage UI - Setup Instructions

## ⚠️ Important: Schema Error Fix

If you're seeing a schema error in `angular.json`, it's because the `node_modules` directory needs to be installed after the project rename.

### Quick Fix:

```bash
# Navigate to the UI directory
cd services/storage-ui

# Install dependencies
npm install

# This will create node_modules with the Angular CLI schema
# The schema error in angular.json will be resolved
```

### What Happened:

When we renamed the project from `storage-ui` to `ai-powered-file-storage-ui`, we updated all the references in `angular.json`, but the `node_modules` directory wasn't present in the repo (as expected for git repositories).

### Verify Fix:

After running `npm install`, the schema error should disappear and you can run:

```bash
# Start the development server
npm start

# Or build the project
npm run build
```

### Project Structure:

- **Project Name**: `ai-powered-file-storage-ui`
- **Output Directory**: `dist/ai-powered-file-storage-ui`
- **Build Targets**: Updated to match new project name

All Angular CLI commands will now work correctly with the new project name.
