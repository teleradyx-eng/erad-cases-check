#!/usr/bin/env node

/**
 * Test script to help identify the correct selectors for your portal.
 * Run this locally to debug and find the right element selectors.
 */

const puppeteer = require('puppeteer');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setupBrowser(headless = false) {
    /**
     * Setup browser for testing
     */
    const browser = await puppeteer.launch({
        headless: headless ? 'new' : false, // Set to false for testing so you can see what's happening
        defaultViewport: {
            width: 1920,
            height: 1080
        },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    return { browser, page };
}

async function testLoginSelectors() {
    /**
     * Test different selectors to find login elements
     */
    const portalUrl = process.env.PORTAL_URL || 'https://your-portal.com';
    
    const { browser, page } = await setupBrowser();
    
    try {
        console.log(`Navigating to: ${portalUrl}`);
        await page.goto(portalUrl, { waitUntil: 'networkidle2' });
        
        console.log('\n=== TESTING LOGIN SELECTORS ===');
        
        // Test different username field selectors
        const usernameSelectors = [
            'input[name="username"]',
            'input[name="email"]',
            'input[name="login"]',
            '#username',
            '#email',
            '#login',
            'input[type="text"]',
            'input[type="email"]',
            'input[placeholder*="Username" i]',
            'input[placeholder*="Email" i]'
        ];
        
        console.log('\nTesting username field selectors:');
        for (const selector of usernameSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    const placeholder = await page.evaluate(el => el.placeholder, element);
                    const name = await page.evaluate(el => el.name, element);
                    console.log(`✅ FOUND: '${selector}'`);
                    console.log(`   Placeholder: '${placeholder}', Name: '${name}'`);
                } else {
                    console.log(`❌ NOT FOUND: '${selector}'`);
                }
            } catch (error) {
                console.log(`❌ ERROR: '${selector}' - ${error.message}`);
            }
        }
        
        // Test different password field selectors
        const passwordSelectors = [
            'input[name="password"]',
            '#password',
            'input[type="password"]',
            'input[placeholder*="Password" i]'
        ];
        
        console.log('\nTesting password field selectors:');
        for (const selector of passwordSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ FOUND: '${selector}'`);
                } else {
                    console.log(`❌ NOT FOUND: '${selector}'`);
                }
            } catch (error) {
                console.log(`❌ ERROR: '${selector}' - ${error.message}`);
            }
        }
        
        // Test different login button selectors
        const buttonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.login-btn',
            '.btn-login',
            '#login-button',
            'button:has-text("Login")',
            'button:has-text("Sign In")',
            'button[class*="login" i]',
            'input[value*="Login" i]'
        ];
        
        console.log('\nTesting login button selectors:');
        for (const selector of buttonSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    const text = await page.evaluate(el => el.textContent || el.value, element);
                    console.log(`✅ FOUND: '${selector}'`);
                    console.log(`   Button text: '${text.trim()}'`);
                } else {
                    console.log(`❌ NOT FOUND: '${selector}'`);
                }
            } catch (error) {
                console.log(`❌ ERROR: '${selector}' - ${error.message}`);
            }
        }
        
        console.log('\n=== MANUAL INSPECTION ===');
        console.log('The browser window is open. You can:');
        console.log('1. Right-click on elements and "Inspect"');
        console.log('2. Copy selectors from developer tools');
        console.log('3. Test them in the browser console');
        console.log('\nPress Enter when you\'re done inspecting...');
        
        await question('');
        
    } finally {
        await browser.close();
    }
}

async function testAfterLogin() {
    /**
     * Test selectors after successful login (run this after updating login selectors)
     */
    const portalUrl = process.env.PORTAL_URL;
    const username = process.env.PORTAL_USERNAME;
    const password = process.env.PORTAL_PASSWORD;
    
    if (!portalUrl || !username || !password) {
        console.log('Please set PORTAL_URL, PORTAL_USERNAME, and PORTAL_PASSWORD in your .env file');
        return;
    }
    
    const { browser, page } = await setupBrowser();
    
    try {
        console.log(`Logging into: ${portalUrl}`);
        await page.goto(portalUrl, { waitUntil: 'networkidle2' });
        
        // You'll need to update these selectors based on your findings
        console.log('Attempting login with current selectors...');
        
        // Login (update these selectors based on testLoginSelectors results)
        await page.type('input[name="username"]', username); // UPDATE THIS
        await page.type('input[name="password"]', password); // UPDATE THIS
        await page.click('button[type="submit"]'); // UPDATE THIS
        
        // Wait for navigation
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        
        console.log('\n=== TESTING POST-LOGIN SELECTORS ===');
        
        // Test dashboard/success indicators
        const dashboardSelectors = [
            '.dashboard',
            '.main-content',
            '.home',
            '#dashboard',
            '.navbar',
            'h1:has-text("Dashboard")',
            '[class*="dashboard" i]'
        ];
        
        console.log('\nTesting dashboard/success selectors:');
        for (const selector of dashboardSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ FOUND: '${selector}'`);
                } else {
                    console.log(`❌ NOT FOUND: '${selector}'`);
                }
            } catch (error) {
                console.log(`❌ ERROR: '${selector}' - ${error.message}`);
            }
        }
        
        // Test case count selectors
        const caseSelectors = [
            '.case-count',
            '.total-cases',
            '#case-counter',
            '.case-row',
            '.case-item',
            'tbody tr',
            '.pagination-info',
            '[class*="case" i]',
            '[class*="total" i]',
            'span:has-text("Total")',
            'div:has-text("cases")'
        ];
        
        console.log('\nTesting case count selectors:');
        for (const selector of caseSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements && elements.length > 0) {
                    console.log(`✅ FOUND ${elements.length} elements: '${selector}'`);
                    
                    if (elements.length === 1) {
                        const text = await page.evaluate(el => el.textContent, elements[0]);
                        console.log(`   Text: '${text.trim()}'`);
                    } else if (elements.length <= 5) {
                        for (let i = 0; i < elements.length; i++) {
                            const text = await page.evaluate(el => el.textContent, elements[i]);
                            console.log(`   Element ${i + 1}: '${text.trim().substring(0, 50)}...'`);
                        }
                    } else {
                        console.log(`   (Too many elements to display - might be case rows)`);
                    }
                } else {
                    console.log(`❌ NOT FOUND: '${selector}'`);
                }
            } catch (error) {
                console.log(`❌ ERROR: '${selector}' - ${error.message}`);
            }
        }
        
        console.log('\n=== MANUAL INSPECTION ===');
        console.log('Navigate to the cases page and inspect elements.');
        console.log('Look for:');
        console.log('- Case counter/total number');
        console.log('- Table rows with cases');
        console.log('- Pagination information');
        console.log('\nPress Enter when done...');
        
        await question('');
        
    } catch (error) {
        console.error(`Error during login test: ${error.message}`);
        console.log('Update the login selectors in this script first!');
    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('Selector Testing Tool');
    console.log('====================');
    console.log('1. Test login selectors');
    console.log('2. Test post-login selectors (after updating login selectors)');
    
    const choice = await question('\nEnter choice (1 or 2): ');
    
    try {
        if (choice.trim() === '1') {
            await testLoginSelectors();
        } else if (choice.trim() === '2') {
            await testAfterLogin();
        } else {
            console.log('Invalid choice');
        }
    } catch (error) {
        console.error(`Test failed: ${error.message}`);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
}
