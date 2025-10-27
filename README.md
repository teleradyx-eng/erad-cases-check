# Teleradyx Cases Monitor

Automated monitoring system that checks case counts on the eRad portal every 15 minutes and sends alerts when new cases are detected.

## Features

- 🔄 **Automated Monitoring**: Runs every 15 minutes via GitHub Actions
- 🔐 **Secure Login**: Handles portal authentication automatically  
- 📊 **Multi-Worklist Tracking**: Monitors "A##MY LIST" and "CT ASSIGN" worklists
- 🚨 **Smart Alerts**: Only alerts when new cases are detected
- 📝 **Detailed Logging**: Comprehensive logs for debugging and monitoring
- ⚡ **Fast Execution**: Puppeteer browser caching reduces action runtime
- 🆓 **Free to Run**: Uses GitHub Actions (free tier includes 2000 minutes/month)

## Quick Setup

### 1. Configure GitHub Secrets

1. Go to your GitHub repository settings
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add these repository secrets:
   - `PORTAL_USERNAME`: Your eRad portal username
   - `PORTAL_PASSWORD`: Your eRad portal password

### 2. Test Locally

The script is already configured for the eRad portal. Test it locally before deploying:

```bash
# Install dependencies
npm install

# Create local environment file
cp env.example .env
# Edit .env with your credentials

# Run a test (browser will open)
npm start
```

### 3. Enable GitHub Actions

1. Push your changes to GitHub
2. Go to **Actions** tab in your repository
3. Enable workflows if prompted
4. The monitor will run automatically every 15 minutes
5. You can also trigger it manually using "Run workflow"

## How It Works

1. **Scheduled Execution**: GitHub Actions triggers every 15 minutes
2. **Browser Caching**: Puppeteer browser is cached to speed up execution (~30-60s runtime)
3. **Portal Login**: Script logs into the eRad portal automatically
4. **Worklist Navigation**: 
   - Opens the worklist dropdown
   - Selects and loads "A##MY LIST" worklist
   - Counts cases in the tab panel
   - Selects and loads "CT ASSIGN" worklist
   - Counts cases in the tab panel
5. **Change Detection**: Compares total count with previous run
6. **Alert Generation**: Logs alert if new cases are detected
7. **History Tracking**: Commits case counts with timestamp to `case-history.json`

## Architecture

### Local Development
- Browser runs in **headed mode** (visible window)
- Uses system Chrome on macOS
- Real-time debugging and inspection

### GitHub Actions (CI)
- Browser runs in **headless mode** (no GUI)
- Uses bundled Chromium (cached for speed)
- Automatic history tracking via Git commits
- Runs every 15 minutes

## Monitoring & Logs

- **Action Logs**: View execution logs in GitHub Actions tab
- **Case History**: `case-history.csv` contains all case counts with IST timestamps (committed to repo)
- **Manual Trigger**: Use "Run workflow" button for immediate checks
- **Local Logs**: `case-monitor.log` file contains detailed execution history

## Performance Optimizations

### Puppeteer Browser Caching
The workflow caches the Puppeteer browser between runs:
- **Cache Key**: Based on Puppeteer version from `package.json`
- **Cache Location**: `~/.cache/puppeteer`
- **Speed Improvement**: Reduces run time from 2-3 minutes to 30-60 seconds
- **Cache Behavior**: Automatically invalidates when Puppeteer version changes

### Workflow Efficiency
- Node.js dependencies cached via `actions/setup-node`
- State file persisted as artifact (no database needed)
- Headless mode in CI for faster execution

## Adding More Worklists

To monitor additional worklists, edit `case-monitor.js`:

```javascript
// In getCaseCount() method, add more worklists:
const count1 = await this.openWorklistAndCount(page, 'A##MY LIST');
const count2 = await this.openWorklistAndCount(page, 'CT ASSIGN');
const count3 = await this.openWorklistAndCount(page, 'NEW WORKLIST'); // Add this

// Update total calculation
if (count3 !== null) {
    totalCount += count3;
}
```

## Debugging Tips

1. **Test Locally First**: Run locally to see the browser in action
2. **Check Action Logs**: View detailed logs in GitHub Actions tab
3. **Download Artifacts**: State files and logs are available as artifacts
4. **Debug Console**: Browser console logs are captured (search for "DEBUG:" in logs)
5. **Manual Trigger**: Use "Run workflow" to test without waiting for schedule

## Next Steps: Adding WhatsApp Alerts

Once the basic monitoring is working, you can add WhatsApp notifications by:

1. **WhatsApp Business API** (recommended for production)
2. **Telegram Bot** (easier alternative)
3. **Email Notifications** (simplest option)
4. **Slack/Discord Webhooks** (for team notifications)

Let me know which notification method you'd prefer and I'll help implement it!

## Troubleshooting

### Common Issues

1. **Login Failed**: 
   - Verify `PORTAL_USERNAME` and `PORTAL_PASSWORD` secrets are set correctly
   - Check if portal URL has changed
   - Look for "Login failed" in action logs

2. **Case Count Shows 0**: 
   - May be correct if no cases are currently assigned
   - Check browser console logs for "DEBUG:" messages
   - Verify worklist names match exactly ("A##MY LIST", "CT ASSIGN")

3. **GitHub Actions Failing**: 
   - Ensure secrets are configured in repository settings
   - Check if workflow is enabled in Actions tab
   - Verify Puppeteer can access the portal (not blocked by firewall)

4. **Slow Execution**: 
   - First run is slower (downloads browser)
   - Subsequent runs use cached browser (~30-60s)
   - Check cache is working in action logs

### Workflow Permissions

If the workflow can't commit the history file:
1. Go to **Settings** → **Actions** → **General**
2. Under "Workflow permissions", select **"Read and write permissions"**
3. Check "Allow GitHub Actions to create and approve pull requests"
4. Save changes

### History File Issues

If case history isn't updating:
- Check workflow has write permissions (see above)
- View the "Commit case history" step in action logs
- Verify no merge conflicts in the repository

## Project Structure

```
.
├── case-monitor.js          # Main monitoring script
├── case-history.csv         # Case count history in CSV format (committed to repo)
├── case-monitor.log         # Execution logs (not committed)
├── package.json             # Dependencies
├── .env                     # Local credentials (not committed)
├── env.example              # Environment template
├── README.md                # Main documentation
└── .github/
    └── workflows/
        └── case-monitor.yml # GitHub Actions workflow
```

## Contributing

To contribute or report issues:
1. Test changes locally first
2. Ensure no credentials are committed
3. Update README if adding features
4. Submit pull request with description
