#!/usr/bin/env node

/**
 * Teleradyx Cases Monitor
 * Monitors case count on erad portal and sends alerts when new cases are detected.
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

class CaseMonitor {
    constructor(doctorName, username = null, password = null) {
        this.portalUrl = 'https://eradwl.innovativeradiologypc.com/Evo/#login:';
        this.doctorName = doctorName;
        this.username = username;
        this.password = password;
        this.historyFile = `case-history-${doctorName.toLowerCase().replace(/\s+/g, '-')}.csv`;
        this.alertFile = `alert-status-${doctorName.toLowerCase().replace(/\s+/g, '-')}.json`;
        
        if (!this.doctorName || !this.username || !this.password) {
            throw new Error(`Username and password must be provided for ${doctorName}`);
        }
    }
    
    async setupBrowser() {
        /**
         * Setup Puppeteer browser with appropriate options
         * Automatically detects CI environment and adjusts settings
         */
        try {
            const isCI = process.env.CI === 'true';
            
            // Determine executable path based on environment
            let executablePath = undefined;
            if (!isCI && process.platform === 'darwin') {
                // Use system Chrome on macOS for local development
                executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            }
            // In CI, use bundled Chromium (executablePath = undefined)
            
            const browser = await puppeteer.launch({
                headless: isCI ? 'new' : false, // Headless in CI, visible locally
                executablePath: executablePath,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                defaultViewport: {
                    width: 1920,
                    height: 1080
                },
                timeout: 60000
            });
            
            const page = await browser.newPage();
            
            // Set user agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            console.log(`Browser launched in ${isCI ? 'CI (headless)' : 'local (headed)'} mode`);
            
            return { browser, page };
        } catch (error) {
            console.error(`Failed to setup browser: ${error.message}`);
            throw error;
        }
    }
    
    async loginToPortal(page) {
        /**
         * Login to the erad portal
         */
        try {
            console.log('Navigating to portal login page');
            await page.goto(this.portalUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            
            // Wait a bit for page to stabilize
            await page.waitForTimeout(3000);
            
            // Wait for login form to load - look for "Log in to your account" text
            console.log('Waiting for login form with "Log in to your account" text');
            await page.waitForFunction(() => {
                const divs = Array.from(document.querySelectorAll('div'));
                return divs.some(div => div.textContent.includes('Log in to your account'));
            }, { timeout: 30000 });
            
            console.log('Login form loaded, entering credentials');
            
            // Enter username
            await page.waitForSelector('input[type="text"][class="Input"][name="userid"]', { timeout: 10000 });
            await page.type('input[type="text"][class="Input"][name="userid"]', this.username);
            
            // Enter password
            await page.waitForSelector('input[type="password"][class="Input"][name="passwd"]', { timeout: 10000 });
            await page.type('input[type="password"][class="Input"][name="passwd"]', this.password);
            
            // Click the login button (div with classes .Button .LoginButton and text "Log In")
            console.log('Clicking login button');
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('.Button.LoginButton'));
                const loginButton = buttons.find(btn => btn.textContent.trim() === 'Log In');
                if (loginButton) {
                    loginButton.click();
                }
            });
            
            // Wait for 15 seconds after clicking login
            console.log('Waiting 15 seconds for login to process');
            await page.waitForTimeout(15000);
            
            // Wait for the eRad div to appear (confirms successful login)
            console.log('Waiting for eRad portal to load');
            await page.waitForSelector('div.gwt-HTML.eRad[style*="display: inline-block"]', { timeout: 20000 });
            
            console.log('Successfully logged in to portal');
            return true;
            
        } catch (error) {
            console.error(`Login failed: ${error.message}`);
            return false;
        }
    }
    
    async openWorklistAndCount(page, worklistName) {
        /**
         * Opens a worklist and counts the cases in it
         * @param {Object} page - Puppeteer page object
         * @param {String} worklistName - Name of the worklist to open
         * @returns {Number|null} - Case count or null if not found
         */
        try {
            // Open dropdown to access the worklist
            await page.click('.FILTER_DOWN');
            await page.waitForTimeout(2000);
            
            // Find and click the worklist
            console.log(`Opening worklist: ${worklistName}`);
            const clicked = await page.evaluate((name) => {
                const labels = Array.from(document.querySelectorAll('.gwt-Label.epserv-ListLabel'));
                const worklist = labels.find(label => label.textContent.trim() === name);
                if (worklist) {
                    worklist.click();
                    return true;
                }
                return false;
            }, worklistName);
            
            if (!clicked) {
                console.warn(`Could not find ${worklistName} worklist`);
                return null;
            }
            console.log(`Clicked ${worklistName}, waiting 15 seconds for data to load`);
            await page.waitForTimeout(15000);
            
            // Count cases in the worklist
            console.info(`Counting cases in ${worklistName}`);
            const count = await page.evaluate((name) => {
                const innerRows = Array.from(document.querySelectorAll('.InnerRow'));
                console.log('DEBUG: Found', innerRows.length, 'InnerRow elements');
                
                for (const row of innerRows) {
                    // Look for any div inside the row that contains the worklist name
                    const divs = Array.from(row.querySelectorAll('div'));
                    const hasTargetText = divs.some(div => div.textContent.includes(name));
                    
                    if (hasTargetText) {
                        console.log(`DEBUG: Found row with ${name} text`);
                        // Look for the count element
                        const countElement = row.querySelector('.epserv-TabPanel-BarTotalNum');
                        console.log('DEBUG: Count element:', countElement ? countElement.textContent.trim() : 'null');
                        if (countElement) {
                            return parseInt(countElement.textContent.trim()) || 0;
                        }
                    }
                }
                return null;
            }, worklistName);
            
            console.info(`${worklistName} case count: ${count !== null ? count : 'Not found'}`);
            return count;
            
        } catch (error) {
            console.error(`Failed to process ${worklistName}: ${error.message}`);
            return null;
        }
    }
    
    async getCaseCount(page) {
        /**
         * Extract case count from the portal by opening worklists
         * Returns object with individual worklist counts and total
         */
        try {
            console.info('Starting worklist case count extraction');
            
            // Wait for dropdown to be available
            await page.waitForSelector('.FILTER_DOWN', { timeout: 10000 });
            
            // Process each worklist
            const count1 = await this.openWorklistAndCount(page, 'A##MY LIST');
            const count2 = await this.openWorklistAndCount(page, 'UNVIEWED');
            
            // Build worklist counts object
            const worklistCounts = {
                'A##MY LIST': count1 !== null ? count1 : 0,
                'UNVIEWED': count2 !== null ? count2 : 0
            };
            
            // Calculate total count
            let totalCount = count1 !== null ? count1 : 0;
            
            // Return null if all failed
            if (count1 === null && count2 === null) {
                console.warn('Could not extract case counts from any worklist');
                return null;
            }
            
            return {
                worklists: worklistCounts,
                total: totalCount
            };
            
        } catch (error) {
            console.error(`Failed to get case count: ${error.message}`);
            return null;
        }
    }
    
    formatToIST(date) {
        /**
         * Format date to IST readable format (without comma for CSV)
         */
        const istDate = date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        // Remove comma from format for CSV compatibility
        return istDate.replace(',', '');
    }
    
    async ensureCSVHeader(worklistCounts) {
        /**
         * Ensure CSV file has header row with dynamic columns
         */
        try {
            const fileExists = await fs.pathExists(this.historyFile);
            if (!fileExists) {
                // Generate header dynamically from worklist names
                const worklistNames = Object.keys(worklistCounts);
                const header = `Time,${worklistNames.join(',')}\n`;
                await fs.writeFile(this.historyFile, header);
                console.info('Created CSV history file with header');
            }
        } catch (error) {
            console.error(`Could not create CSV header: ${error.message}`);
        }
    }
    
    async saveToHistory(worklistCounts, totalCount) {
        /**
         * Save case counts to CSV history file with timestamp
         */
        try {
            // Ensure header exists
            await this.ensureCSVHeader(worklistCounts);
            
            // Format timestamp to IST
            const now = new Date();
            const istTime = this.formatToIST(now);
            
            // Create CSV row dynamically from worklist counts
            const worklistValues = Object.values(worklistCounts);
            const csvRow = `${istTime},${worklistValues.join(',')}\n`;
            
            // Append to file
            await fs.appendFile(this.historyFile, csvRow);
            console.info(`Saved to CSV: ${istTime} | Total: ${totalCount}`);
            
        } catch (error) {
            console.error(`Could not save to history: ${error.message}`);
        }
    }
    
    async createAlertFile(worklists, currentCount) {
        /**
         * Create alert file for GitHub Actions to send email
         */
        try {
            const alertData = {
                hasCases: currentCount > 1,
                casesFound: currentCount,
                timestamp: new Date().toISOString(),
                doctorName: this.doctorName,
                worklists: worklists,
                formattedMessage: this.formatEmailMessage(worklists, currentCount)
            };
            
            await fs.writeJson(this.alertFile, alertData, { spaces: 2 });
            console.info('Alert file created for email notification');
            
        } catch (error) {
            console.error(`Could not create alert file: ${error.message}`);
        }
    }
    
    formatEmailMessage(worklists, currentCount) {
        let message = `📊 Case Count Report - ${this.doctorName}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        message += `👨‍⚕️ Rad: ${this.doctorName}\n\n`;
        
        message += `📋 WORKLIST DETAILS:\n\n`;
        
        // Dynamically add all worklists
        for (const [worklistName, count] of Object.entries(worklists)) {
            message += `  • ${worklistName}: ${count} cases\n`;
        }
        message += `\n`;
        
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        message += `📈 TOTAL CASES: ${currentCount}\n`;
        
        message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        
        return message;
    }
    
    async runCheck() {
        /**
         * Main method to run a single check
         */
        console.info('Starting case count check');
        
        let browser = null;
        try {
            // Setup browser
            const { browser: browserInstance, page } = await this.setupBrowser();
            browser = browserInstance;
            
            // Login to portal
            const loginSuccess = await this.loginToPortal(page);
            if (!loginSuccess) {
                throw new Error('Failed to login to portal');
            }
            
            // Get current case count (returns object with worklists and total)
            const currentData = await this.getCaseCount(page);
            if (currentData === null) {
                throw new Error('Failed to get case count from portal');
            }
            
            const { worklists, total: currentCount } = currentData;
            
            
            console.info(`Current case count: ${currentCount}`);
            
            // Save to history
            await this.saveToHistory(worklists, currentCount);
            
            // Create alert file for email (only if cases exist in A##MY LIST)
            const shouldSendEmail = worklists['A##MY LIST'] > 0;
            if (shouldSendEmail) {
                await this.createAlertFile(worklists, currentCount);
                console.info(`Alert created: ${currentCount} cases found (A##MY LIST: ${worklists['A##MY LIST']})`);
            } else {
                console.info('No cases found in A##MY LIST, no alert sent');
            }
            
            console.info('Check completed successfully');
            
        } catch (error) {
            console.error(`Check failed with error: ${error.message}`);
            throw error;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }
}

async function main() {
    /**
     * Main entry point - runs checks for multiple doctors sequentially
     */
    try {
        // Define doctor accounts
        const doctors = [
            {
                name: 'Dr. Abdaallah',
                username: process.env.DOCTOR1_USERNAME,
                password: process.env.DOCTOR1_PASSWORD
            },
            {
                name: 'Dr. Amit',
                username: process.env.DOCTOR2_USERNAME,
                password: process.env.DOCTOR2_PASSWORD
            }
        ];
        
        console.log('='.repeat(60));
        console.log('Starting automated case monitoring for multiple doctors');
        console.log('='.repeat(60));
        
        let hasFailures = false;
        const results = [];
        
        // Run checks for each doctor sequentially
        for (const doctor of doctors) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Processing: ${doctor.name}`);
            console.log('='.repeat(60));
            
            try {
                const monitor = new CaseMonitor(doctor.name, doctor.username, doctor.password);
                await monitor.runCheck();
                console.log(`✅ Successfully completed check for ${doctor.name}`);
                results.push({ doctor: doctor.name, status: 'success' });
            } catch (error) {
                console.error(`❌ Check failed for ${doctor.name}: ${error.message}`);
                hasFailures = true;
                results.push({ doctor: doctor.name, status: 'failed', error: error.message });
                // Continue with next doctor even if one fails
            }
            
            // Wait a bit between doctors to ensure clean separation
            console.log(`Waiting 3 seconds before next doctor...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log('All doctor checks completed');
        console.log('='.repeat(60));
        
        // Print summary
        console.log('\n📊 SUMMARY:');
        for (const result of results) {
            const statusEmoji = result.status === 'success' ? '✅' : '❌';
            console.log(`  ${statusEmoji} ${result.doctor}: ${result.status.toUpperCase()}${result.error ? ` - ${result.error}` : ''}`);
        }
        
        // Exit with error if any check failed
        if (hasFailures) {
            console.error('\n⚠️  One or more checks failed. Exiting with error code.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`Application failed: ${error.message}`);
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = CaseMonitor;
