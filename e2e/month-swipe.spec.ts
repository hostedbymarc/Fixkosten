import { expect, isTouchProject, row, test, touchSwipe } from './fixtures';

test.describe('Monat wechseln per Wischen', () => {
  test('links wischen → nächster Monat, rechts wischen → voriger Monat', async ({ app }) => {
    test.skip(!isTouchProject(), 'touch only (iPhone, iPad)');
    const screen = app.getByTestId('month-screen');
    const title = app.getByRole('heading', { level: 1 });
    await expect(title).toHaveText('Oktober 2026');

    await touchSwipe(app, screen, -160);
    await expect(title).toHaveText('November 2026');
    await touchSwipe(app, screen, -160);
    await expect(title).toHaveText('Dezember 2026');
    await touchSwipe(app, screen, 160);
    await touchSwipe(app, screen, 160);
    await expect(title).toHaveText('Oktober 2026');
  });

  test('kurze oder schräge Bewegungen wechseln nicht; Wischen über eine Zeile hakt nichts ab', async ({ app }) => {
    test.skip(!isTouchProject(), 'touch only (iPhone, iPad)');
    const screen = app.getByTestId('month-screen');
    const title = app.getByRole('heading', { level: 1 });
    await touchSwipe(app, screen, -40); // below the threshold
    await expect(title).toHaveText('Oktober 2026');
    await touchSwipe(app, screen, -120, 160); // mostly vertical = scrolling
    await expect(title).toHaveText('Oktober 2026');

    // a swipe that starts on an open row switches the month but never ticks it
    const depot = row(app, 'pos-depotentgelt');
    await expect(depot).toHaveAttribute('data-status', 'open');
    await touchSwipe(app, depot.getByTestId('toggle-paid'), 160);
    await expect(title).toHaveText('September 2026');
    await touchSwipe(app, screen, -160);
    await expect(title).toHaveText('Oktober 2026');
    await expect(row(app, 'pos-depotentgelt')).toHaveAttribute('data-status', 'open');
  });

  test('Desktop: Maus ziehen wechselt nicht, die Pfeile bleiben', async ({ app }) => {
    test.skip(isTouchProject(), 'desktop only');
    const box = (await app.getByTestId('month-screen').boundingBox())!;
    await app.mouse.move(box.x + box.width * 0.7, box.y + 400);
    await app.mouse.down();
    await app.mouse.move(box.x + box.width * 0.2, box.y + 400, { steps: 10 });
    await app.mouse.up();
    await expect(app.getByRole('heading', { level: 1 })).toHaveText('Oktober 2026');
    await app.getByRole('button', { name: 'Nächster Monat' }).click();
    await expect(app.getByRole('heading', { level: 1 })).toHaveText('November 2026');
  });
});
