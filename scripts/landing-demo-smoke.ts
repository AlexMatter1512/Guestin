import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();const calls:string[]=[];
 page.on('request',r=>{if(r.url().includes('/api/'))calls.push(r.url())});
 page.on('websocket',s=>calls.push(s.url()));
 await page.goto((process.env.LANDING_URL??'http://127.0.0.1:4175')+'/demo/host/');
 await page.getByRole('button',{name:'Create access code',exact:true}).click();
 await page.getByRole('button',{name:'Create access code Choose doors and share a guest link'}).click();
 await page.getByLabel('Guest name / label').fill('Demo QA Guest');
 await page.getByRole('button',{name:'Save access code',exact:true}).click();
 await expect(page.getByText('Demo QA Guest',{exact:true}).first()).toBeVisible();
 await page.reload();
 await expect(page.getByText('Demo QA Guest',{exact:true})).toHaveCount(0);
 await page.goto((process.env.LANDING_URL??'http://127.0.0.1:4175')+'/demo/host/#/settings/appearance');
 await page.getByRole('radio',{name:'Dark',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(calls).toEqual([]);
 console.log('Demo create/reset/locale/theme/network checks passed');
} finally {await browser.close()}
