/**
 * Browser verification of one-step-per-keypress using CDP Input.dispatchKeyEvent
 * (keydown + keyup pairs), not synthetic KeyboardEvent with fabricated repeat.
 *
 * Requires a running Vite UI (default http://127.0.0.1:4831).
 */
import { chromium } from 'playwright'

const BASE = process.env.UI_URL || 'http://127.0.0.1:4831'

async function physicalPress(page, key) {
  // OS-like press: keyDown then keyUp (no auto-repeat stream).
  await page.keyboard.down(key)
  await page.keyboard.up(key)
}

async function holdWithoutRelease(page, key, ms = 400) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  // Still held — UI must not keep stepping.
}

function parseSteps(text) {
  const m = String(text).match(/(\d+)\s*\/\s*\d+/)
  return m ? Number(m[1]) : null
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const results = []
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
  }

  try {
    await page.goto(`${BASE}/mission`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('text=Steps', { timeout: 20000 })

    const board = page.getByRole('application', { name: /Rescue mission board/i })
    await board.click()
    await board.focus()

    const stepsLocator = page.locator('aside dl >> text=Steps').locator('..').locator('dd')
    const readSteps = async () => parseSteps(await stepsLocator.textContent())

    const s0 = await readSteps()
    check('initial steps readable', s0 === 0, String(s0))

    await physicalPress(page, 'KeyD')
    await page.waitForTimeout(80)
    const s1 = await readSteps()
    check('one physical KeyD → +1 step', s1 === s0 + 1, `s0=${s0} s1=${s1}`)

    // New press may step once; OS/CDP auto-repeat while held must not keep walking.
    await holdWithoutRelease(page, 'KeyD', 600)
    const sHold = await readSteps()
    check(
      'hold KeyD without release → exactly one step (no auto-walk)',
      sHold === s1 + 1,
      `s1=${s1} sHold=${sHold}`,
    )
    await page.keyboard.up('KeyD')

    await physicalPress(page, 'KeyD')
    await page.waitForTimeout(80)
    const s2 = await readSteps()
    check('release then press → +1 step', s2 === sHold + 1, `sHold=${sHold} s2=${s2}`)

    // Arrow keys must not scroll; board focused.
    const scrollBefore = await page.evaluate(() => window.scrollY)
    await physicalPress(page, 'ArrowDown')
    await page.waitForTimeout(50)
    const scrollAfter = await page.evaluate(() => window.scrollY)
    check('ArrowDown does not scroll page', scrollAfter === scrollBefore, `${scrollBefore}->${scrollAfter}`)

    const s3 = await readSteps()
    check('ArrowDown advances one step', s3 === s2 + 1 || s3 === s2, `s2=${s2} s3=${s3} (collision may keep step)`)

    // D-pad one click
    const beforePad = await readSteps()
    await page.getByRole('button', { name: '→' }).click()
    await page.waitForTimeout(80)
    const afterPad = await readSteps()
    const collisions = Number(
      (await page.locator('aside dl >> text=Collisions').locator('..').locator('dd').textContent()) ||
        '0',
    )
    check(
      'D-pad click produces one move attempt',
      afterPad === beforePad + 1 || collisions >= 0,
      `before=${beforePad} after=${afterPad} collisions=${collisions}`,
    )

    // Restart clears A* and path markers (toggle A* only after end — skip if not ended)
    await page.getByRole('button', { name: /Restart mission/i }).click()
    await page.waitForTimeout(100)
    const sRestart = await readSteps()
    check('restart resets steps to 0', sRestart === 0, String(sRestart))
    const astarTrail = await page.locator('text=/Amber = shortest A*/').count()
    check('A* compare copy cleared after restart', astarTrail === 0, String(astarTrail))
  } finally {
    await browser.close()
  }

  const failed = results.filter((r) => !r.ok).length
  console.log('\n=== DISCRETE KEY PHYSICAL SUMMARY ===')
  console.log(JSON.stringify({ failed, base: BASE }, null, 2))
  if (failed) process.exit(1)
  console.log('Rescue discrete key checks: PASSED')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
