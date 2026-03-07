# Contributing Guide

Thank you for your interest in **UISelector2AI**! We warmly welcome contributions from the community. Whether it's reporting issues, suggesting features, or submitting code, your participation is greatly valued.

## 🚀 Getting Started

### 1. Fork & Clone

```bash
# Fork this repository to your GitHub account
# Then clone it locally
git clone https://github.com/<your-username>/UISelector2AI.git
cd UISelector2AI
```

### 2. Install & Load the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the project root directory

### 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

## 📋 Contribution Workflow

### Bug Reports

1. Go to the [Issues](../../issues) page
2. Click **New Issue**
3. Please include:
   - **Description**: Clearly describe the problem
   - **Steps to reproduce**: How to reproduce the issue
   - **Expected behavior**: What you expected to happen
   - **Environment**: Chrome version, OS

### Feature Requests

1. Go to the [Issues](../../issues) page
2. Describe the feature you'd like and its use case

### Pull Requests

1. Ensure your code follows the project's existing style
2. After making changes, reload the extension in Chrome and test
3. Write clear commit messages
4. Submit a Pull Request with a description of your changes

## 🧑‍💻 Development Guidelines

### Code Style

- Use **2 spaces** for indentation
- Use `const` / `let`, avoid `var`
- Use **camelCase** for function and variable names

### Commit Message Format

```
<type>: <short description>

<detailed explanation (optional)>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation update
- `style`: Style changes (no functional impact)
- `refactor`: Code refactoring

### Project Structure

```
agentation-chrom-extension/
├── manifest.json          # Chrome extension configuration
├── src/
│   ├── background.js      # Service Worker
│   ├── content.js         # Content Script (DOM interaction)
│   ├── styles.css         # Content Script styles
│   ├── ui.css             # UI component styles
│   ├── popup/             # Popup interface
│   └── sidepanel/         # Side Panel interface
├── icons/                 # Extension icons
└── store_assets/          # Chrome Web Store assets
```

## 📜 License

All contributions to this project are licensed under the [MIT License](LICENSE).

## 💬 Questions?

Feel free to ask in [Issues](../../issues) — we'll get back to you as soon as possible!
