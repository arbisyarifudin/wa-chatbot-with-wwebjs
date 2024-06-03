const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
// const cron = require('node-cron');

const INSTAGRAM_URL = 'https://www.instagram.com';
const TARGET_USERNAME = 'taaruf.co.id';
const USERNAME = 'taarufin.official';
const PASSWORD = 'Taarufin@2024';
const CAPTIONS_FILE = 'storages/scraper_captions';
const POST_IDS_FILE = 'storages/scraper_ids.json';

// Fungsi untuk login ke Instagram
async function loginInstagram(page, username, password) {
    await page.goto(`${INSTAGRAM_URL}/accounts/login/`, { waitUntil: 'networkidle2' });
    // await page.waitForSelector('input[name="username"]');
    // await page.type('input[name="username"]', username);
    // await page.type('input[name="password"]', password);

    await page.waitForSelector('input[aria-label="Phone number, username or email address"]');
    await page.type('input[aria-label="Phone number, username or email address"]', username);
    await page.type('input[aria-label="Password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
}

// Fungsi untuk mengambil ID dan caption dari 9 postingan terbaru
async function getLatestPosts(page, targetUsername) {
    await page.goto(`${INSTAGRAM_URL}/${targetUsername}/`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('a img');

    const posts = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('a img'));

        // 1 is user profile picture, so we skip it
        return nodes.slice(1, 9).map(node => {
            const parent = node.closest('a');
            const hrefArray = parent.href.split('/');
            if (!hrefArray.length) {
                return null;
            }
            const postId = hrefArray[hrefArray.length - 2];
            const postType = hrefArray[hrefArray.length - 3];
            const caption = node.alt;
            return { postId, postType, caption };
        }).filter(v => v !== null);
    });

    return posts;
}

// Fungsi untuk memeriksa apakah pengguna sudah login
async function isUserLoggedIn(page) {
    await page.goto(INSTAGRAM_URL, { waitUntil: 'networkidle2' });
    try {
        await page.waitForSelector('svg[aria-label="Settings"]', { timeout: 5000 });
        return true;
    } catch (error) {
        return false;
    }
}

// Fungsi utama untuk mengelola proses
async function main() {
    const browser = await puppeteer.launch({ 
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // <- this one doesn't works in Windows
            '--disable-gpu'
        ],
        userDataDir: path.join(__dirname, '.puppeteer/scraper_data')
     });
    const page = await browser.newPage();

    try {

        console.log('Checking if user is logged in...');
        const loggedIn = await isUserLoggedIn(page);
        if (!loggedIn) {
            console.log('Logging in...');
            await loginInstagram(page, USERNAME, PASSWORD);
        }

        console.log('Getting latest posts...');

        const currentDateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Baca ID postingan yang sudah diambil sebelumnya
        let savedPostIds = [];
        if (fs.existsSync(POST_IDS_FILE)) {
            try {
                savedPostIds = JSON.parse(fs.readFileSync(POST_IDS_FILE, 'utf-8'));
            } catch (error) {
                // savedPostIds = [];                
                savedPostIds = {};                
            }
        }

        const posts = await getLatestPosts(page, TARGET_USERNAME);
        // console.log('Posts:', posts);

        let newCaptions = [];
        let newPostIds = [];

        posts.forEach(post => {
            // if (!savedPostIds.includes(post.postId)) {
            if (!savedPostIds[currentDateStr]) {
                savedPostIds[currentDateStr] = [];
            }
            if (!savedPostIds[currentDateStr].includes(post.postId)) {

                // Skip caption yang tidak ada kata-kata "Nama:" atau "Nama :" atau "Jns kelamin:" atau "Jns kelamin :"
                if (!post.caption.match(/Nama\s*:/) && !post.caption.match(/Jns kelamin\s*:/)) {
                    return;
                }

                // newCaptions.push(post.caption);
                const headerTitle = `=====${TARGET_USERNAME}/${post.postType}/${post.postId}=====`;
                newCaptions.push(headerTitle + '\n' + post.caption);
                newPostIds.push(post.postId);
            }
        });

        console.log('New post found:', newCaptions.length);
        if (newCaptions.length > 0) {
            console.log('Saving captions...');
            const captionsText = newCaptions.join('\n\n');
            // fs.writeFileSync(CAPTIONS_FILE, captionsText, { flag: 'a' });
            fs.writeFileSync(CAPTIONS_FILE + `_${currentDateStr}.txt`, captionsText);
            // console.log('Captions saved:', newCaptions);
            console.log('Captions saved!');

            // Simpan ID postingan baru
            // savedPostIds = savedPostIds.concat(newPostIds);
            savedPostIds[currentDateStr] = savedPostIds[currentDateStr].concat(newPostIds);
            fs.writeFileSync(POST_IDS_FILE, JSON.stringify(savedPostIds, null, 2));
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
}

// Jadwalkan tugas untuk dijalankan setiap 1 jam
// cron.schedule('0 * * * *', main);

main();
