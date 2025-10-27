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
    constructor() {
        this.portalUrl = 'https://eradwl.innovativeradiologypc.com/Evo/#login:';
        this.username = process.env.PORTAL_USERNAME;
        this.password = process.env.PORTAL_PASSWORD;
        this.historyFile = 'case-history.csv';
        
        if (!this.username || !this.password) {
            throw new Error('PORTAL_USERNAME and PORTAL_PASSWORD must be set in environment variables');
        }
        
        this.setupLogging();
    }
    
    setupLogging() {
        // Simple logging setup
        this.log = {
            info: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `${timestamp} - INFO - ${message}`;
                console.log(logMessage);
                this.writeToLogFile(logMessage);
            },
            error: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `${timestamp} - ERROR - ${message}`;
                console.error(logMessage);
                this.writeToLogFile(logMessage);
            },
            warning: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `${timestamp} - WARNING - ${message}`;
                console.warn(logMessage);
                this.writeToLogFile(logMessage);
            }
        };
    }
    
    writeToLogFile(message) {
        try {
            fs.appendFileSync('case-monitor.log', message + '\n');
        } catch (error) {
            // Ignore file write errors to prevent infinite loops
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
            
            this.log.info(`Browser launched in ${isCI ? 'CI (headless)' : 'local (headed)'} mode`);
            
            return { browser, page };
        } catch (error) {
            this.log.error(`Failed to setup browser: ${error.message}`);
            throw error;
        }
    }
    
    async loginToPortal(page) {
        /**
         * Login to the erad portal
         */
        try {
            this.log.info('Navigating to portal login page');
            await page.goto(this.portalUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 60000 
            });
            
            // Wait a bit for page to stabilize
            await page.waitForTimeout(3000);
            
            // Wait for login form to load - look for "Log in to your account" text
            this.log.info('Waiting for login form with "Log in to your account" text');
            await page.waitForFunction(() => {
                const divs = Array.from(document.querySelectorAll('div'));
                return divs.some(div => div.textContent.includes('Log in to your account'));
            }, { timeout: 30000 });
            
            this.log.info('Login form loaded, entering credentials');
            
            // Enter username
            await page.waitForSelector('input[type="text"][class="Input"][name="userid"]', { timeout: 10000 });
            await page.type('input[type="text"][class="Input"][name="userid"]', this.username);
            
            // Enter password
            await page.waitForSelector('input[type="password"][class="Input"][name="passwd"]', { timeout: 10000 });
            await page.type('input[type="password"][class="Input"][name="passwd"]', this.password);
            
            // Click the login button (div with classes .Button .LoginButton and text "Log In")
            this.log.info('Clicking login button');
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('.Button.LoginButton'));
                const loginButton = buttons.find(btn => btn.textContent.trim() === 'Log In');
                if (loginButton) {
                    loginButton.click();
                }
            });
            
            // Wait for 15 seconds after clicking login
            this.log.info('Waiting 15 seconds for login to process');
            await page.waitForTimeout(15000);
            
            // Wait for the eRad div to appear (confirms successful login)
            this.log.info('Waiting for eRad portal to load');
            await page.waitForSelector('div.gwt-HTML.eRad[style*="display: inline-block"]', { timeout: 20000 });
            
            this.log.info('Successfully logged in to portal');
            return true;
            
        } catch (error) {
            this.log.error(`Login failed: ${error.message}`);
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
            this.log.info(`Opening worklist: ${worklistName}`);
            const worklist = await page.evaluateHandle((name) => {
                const labels = Array.from(document.querySelectorAll('.gwt-Label.epserv-ListLabel'));
                return labels.find(label => label.textContent.trim() === name);
            }, worklistName);
            
            if (!worklist) {
                this.log.warning(`Could not find ${worklistName} worklist`);
                return null;
            }
            
            await worklist.click();
            this.log.info(`Clicked ${worklistName}, waiting 15 seconds for data to load`);
            await page.waitForTimeout(15000);
            
            // Count cases in the worklist
            this.log.info(`Counting cases in ${worklistName}`);
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
            
            this.log.info(`${worklistName} case count: ${count !== null ? count : 'Not found'}`);
            return count;
            
        } catch (error) {
            this.log.error(`Failed to process ${worklistName}: ${error.message}`);
            return null;
        }
    }
    
    async getCaseCount(page) {
        /**
         * Extract case count from the portal by opening worklists
         * Returns object with individual worklist counts and total
         */
        try {
            this.log.info('Starting worklist case count extraction');
            
            // Wait for dropdown to be available
            await page.waitForSelector('.FILTER_DOWN', { timeout: 10000 });
            
            // Process each worklist
            const count1 = await this.openWorklistAndCount(page, 'A##MY LIST');
            const count2 = await this.openWorklistAndCount(page, 'CT ASSIGN');
            const count3 = await this.openWorklistAndCount(page, 'UNVIEWED');
            
            // Build worklist counts object
            const worklistCounts = {
                'A##MY LIST': count1 !== null ? count1 : 0,
                'CT ASSIGN': count2 !== null ? count2 : 0,
                'UNVIEWED': count3 !== null ? count3 : 0
            };
            
            // Calculate total count
            let totalCount = 0;
            if (count1 !== null) {
                totalCount += count1;
            }
            if (count2 !== null) {
                totalCount += count2;
            }
            
            // Return null if all failed
            if (count1 === null && count2 === null && count3 === null) {
                this.log.warning('Could not extract case counts from any worklist');
                return null;
            }
            
            return {
                worklists: worklistCounts,
                total: totalCount
            };
            
        } catch (error) {
            this.log.error(`Failed to get case count: ${error.message}`);
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
    
    async ensureCSVHeader() {
        /**
         * Ensure CSV file has header row
         */
        try {
            const fileExists = await fs.pathExists(this.historyFile);
            if (!fileExists) {
                const header = 'Time,ASS MY LIST,CT ASSIGN,UNVIEWED\n';
                await fs.writeFile(this.historyFile, header);
                this.log.info('Created CSV history file with header');
            }
        } catch (error) {
            this.log.error(`Could not create CSV header: ${error.message}`);
        }
    }
    
    async saveToHistory(worklistCounts, totalCount) {
        /**
         * Save case counts to CSV history file with timestamp
         */
        try {
            // Ensure header exists
            await this.ensureCSVHeader();
            
            // Format timestamp to IST
            const now = new Date();
            const istTime = this.formatToIST(now);
            
            // Create CSV row (without total, with UNVIEWED as last column)
            const csvRow = `${istTime},${worklistCounts['A##MY LIST']},${worklistCounts['CT ASSIGN']},${worklistCounts['UNVIEWED']}\n`;
            
            // Append to file
            await fs.appendFile(this.historyFile, csvRow);
            this.log.info(`Saved to CSV: ${istTime} | Total: ${totalCount}`);
            
        } catch (error) {
            this.log.error(`Could not save to history: ${error.message}`);
        }
    }
    
    async createAlertFile(worklists, currentCount) {
        /**
         * Create alert file for GitHub Actions to send email
         */
        try {
            const alertData = {
                hasCases: currentCount > 0,
                casesFound: currentCount,
                timestamp: new Date().toISOString(),
                worklists: worklists,
                formattedMessage: this.formatEmailMessage(worklists, currentCount)
            };
            
            await fs.writeJson('alert-status.json', alertData, { spaces: 2 });
            this.log.info('Alert file created for email notification');
            
        } catch (error) {
            this.log.error(`Could not create alert file: ${error.message}`);
        }
    }
    
    formatEmailMessage(worklists, currentCount) {
        /**
         * Format message for email notification
         */
        const timestamp = new Date().toLocaleString('en-US', { 
            timeZone: 'America/New_York',
            dateStyle: 'full',
            timeStyle: 'short'
        });
        
        let message = `📊 Case Count Report\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        message += `📋 WORKLIST DETAILS:\n\n`;
        message += `  • A##MY LIST: ${worklists['A##MY LIST']} cases\n`;
        message += `  • CT ASSIGN: ${worklists['CT ASSIGN']} cases\n`;
        message += `  • UNVIEWED: ${worklists['UNVIEWED']} cases\n\n`;
        
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        message += `📈 TOTAL CASES: ${currentCount}\n`;
        
        message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        
        return message;
    }
    
    async runCheck() {
        /**
         * Main method to run a single check
         */
        this.log.info('Starting case count check');
        
        let browser = null;
        try {
            // Setup browser
            const { browser: browserInstance, page } = await this.setupBrowser();
            browser = browserInstance;
            
            // Login to portal
            const loginSuccess = await this.loginToPortal(page);
            if (!loginSuccess) {
                this.log.error('Failed to login, aborting check');
                return;
            }
            
            // Get current case count (returns object with worklists and total)
            const currentData = await this.getCaseCount(page);
            if (currentData === null) {
                this.log.error('Failed to get case count, aborting check');
                return;
            }
            
            const { worklists, total: currentCount } = currentData;
            
            
            this.log.info(`Current case count: ${currentCount}`);
            this.log.info(`  - A##MY LIST: ${worklists['A##MY LIST']}`);
            this.log.info(`  - CT ASSIGN: ${worklists['CT ASSIGN']}`);
            this.log.info(`  - UNVIEWED: ${worklists['UNVIEWED']}`);
            
            // Save to history
            await this.saveToHistory(worklists, currentCount);
            
            // Create alert file for email (only if cases exist in ASS MY LIST OR CT ASSIGN)
            const shouldSendEmail = worklists['A##MY LIST'] > 0 || worklists['CT ASSIGN'] > 0;
            if (shouldSendEmail) {
                await this.createAlertFile(worklists, currentCount);
                this.log.info(`Alert created: ${currentCount} cases found (ASS MY LIST: ${worklists['A##MY LIST']}, CT ASSIGN: ${worklists['CT ASSIGN']})`);
            } else {
                this.log.info('No cases found in ASS MY LIST or CT ASSIGN, no alert sent');
            }
            
            this.log.info('Check completed successfully');
            
        } catch (error) {
            this.log.error(`Check failed with error: ${error.message}`);
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
     * Main entry point
     */
    try {
        const monitor = new CaseMonitor();
        await monitor.runCheck();
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
