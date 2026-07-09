import { expect, test, type Page } from '@playwright/test';

async function joinAs(page: Page, name: string, avatar: string) {
  await page.goto('/');
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId(`avatar-${avatar}`).click();
  await page.getByTestId('join-button').click();
  await page.waitForURL('**/rooms');
  await page.getByTestId('room-card-food').click();
  await page.waitForURL('**/rooms/food');
}

test('two users chat: text goes in, emoji comes out, tap reveals original', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const alice = await contextA.newPage();
  const bob = await contextB.newPage();

  await joinAs(alice, 'Alice', '🦊');
  await joinAs(bob, 'Bob', '🐙');

  // Unique per run so a stale/reused DB can't produce a false pass
  const phrase = `pizza tonight? run ${Date.now()}`;

  // Alice sends plain text
  await alice.getByTestId('composer-input').fill(phrase);
  await alice.getByTestId('send-button').click();

  // Bob receives it live and it resolves to emoji (dictionary: pizza->🍕, tonight->🌙)
  const bobBubble = bob.getByTestId('message-bubble').last();
  await expect(bobBubble).toContainText('🍕', { timeout: 15_000 });
  await expect(bobBubble).toContainText('🌙');
  await expect(bobBubble).not.toContainText('pizza');

  // Tap to reveal the original text
  await bobBubble.click();
  await expect(bobBubble).toContainText(phrase);

  // Presence: Bob sees Alice's avatar in the strip
  await expect(bob.locator('header')).toContainText('🦊');

  await contextA.close();
  await contextB.close();
});
