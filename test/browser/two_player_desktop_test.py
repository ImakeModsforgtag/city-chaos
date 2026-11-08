import asyncio, json
from playwright.async_api import async_playwright
URL='http://localhost:3000'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']
WALK = """
window.__walkTo = (x, z) => new Promise(res => {
  const cc = window.__cc;
  let last = performance.now();
  const iv = setInterval(() => {
    const now = performance.now(), el = Math.min(0.12, (now - last) / 1000); last = now;
    const f = cc.walker.feet; const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { clearInterval(iv); cc.walker.vel.set(0,0,0); setTimeout(res, 2500); return; }
    const s = Math.min(25 * el, d); f.x += dx / d * s; f.z += dz / d * s; f.y = Math.min(44, f.y + 1.5); cc.walker.vel.set(0,0,0);
  }, 50);
});
window.__face = (x, y, z) => { const cc = window.__cc; const e = cc.camera.getWorldPosition(new cc.camera.position.constructor());
  cc.G.yaw = Math.atan2(-(x - e.x), -(z - e.z)); cc.G.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); };
0;
"""
async def page(b, logs, tag):
    pg = await b.new_page(viewport={'width':800,'height':500})
    pg.on('console', lambda m: logs.append(f'{tag}[{m.type}] {m.text}') if m.type in ('error',) else None)
    pg.on('pageerror', lambda e: logs.append(f'{tag}[PAGEERROR] {e}'))
    return pg
async def main():
    logs=[]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        A = await page(b, logs, 'A'); B = await page(b, logs, 'B')
        await A.goto(URL); await A.wait_for_timeout(2500)
        await A.fill('#name-input', 'Chris')
        await A.click('[data-goto=create]'); await A.wait_for_timeout(300)
        await A.click('#create-mode button[data-val=ffa]')
        await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        code = await A.inner_text('#lobby-code'); print('room code', code)
        url = await A.evaluate('location.href'); print('A url', url)
        await A.screenshot(path='/tmp/shots/02_lobby.png')
        # B opens invite link
        await B.goto(f'{URL}/?room={code}'); await B.wait_for_timeout(2500)
        await B.fill('#join-name', 'Friend')
        await B.screenshot(path='/tmp/shots/03_join.png')
        await B.click('[data-action=join]'); await B.wait_for_timeout(1500)
        await A.wait_for_timeout(500)
        await A.screenshot(path='/tmp/shots/04_lobby2.png')
        print('A lobby players:', await A.inner_text('#lobby-players'))
        for pg in (A, B):
            await pg.evaluate(WALK)
            await pg.click('[data-action=desktop]'); await pg.wait_for_timeout(400)
        print('views', await A.evaluate('__cc.G.view'), await B.evaluate('__cc.G.view'))
        # keyboard movement test on A
        f0 = await A.evaluate('[__cc.walker.feet.x, __cc.walker.feet.z]')
        await A.keyboard.down('KeyW'); await A.wait_for_timeout(1200); await A.keyboard.up('KeyW')
        f1 = await A.evaluate('[__cc.walker.feet.x, __cc.walker.feet.z]')
        print('A moved with W:', round(((f1[0]-f0[0])**2+(f1[1]-f0[1])**2)**0.5,2), 'm')
        await A.keyboard.press('Space'); await A.wait_for_timeout(150)
        print('A jumping y:', await A.evaluate('__cc.walker.feet.y.toFixed(2)'))
        # walk both to the central intersection
        await asyncio.gather(A.evaluate('__walkTo(-4, 0)'), B.evaluate('__walkTo(4, 0)'))
        for i in range(40):
            yb = await A.evaluate('(() => { for (const p of __cc.remote.players.values()) return p.head ? p.head[1] : 99; })()')
            ya = await B.evaluate('(() => { for (const p of __cc.remote.players.values()) return p.head ? p.head[1] : 99; })()')
            if yb < 2 and ya < 2: break
            await A.wait_for_timeout(300)
        await A.wait_for_timeout(500)
        bpos = await A.evaluate('(() => { for (const p of __cc.remote.players.values()) return p.head; })()')
        print('A sees B head at', bpos)
        await A.evaluate(f'__face({bpos[0]}, {bpos[1]}, {bpos[2]})')
        await B.evaluate('__face(-4, 1.5, 0)')
        await A.wait_for_timeout(600)
        await A.screenshot(path='/tmp/shots/05_aim.png')
        # shoot B until dead (pistol body/head)
        for i in range(14):
            await A.evaluate('__cc.weapons.tryFire(true, true)')
            await A.wait_for_timeout(260)
            hp = await B.evaluate('__cc.G.me.hp')
            if hp <= 0: break
        await A.wait_for_timeout(100)
        await A.screenshot(path='/tmp/shots/06_shooting.png')
        print('B hp after shots:', await B.evaluate('__cc.G.me.hp'), 'B alive', await B.evaluate('__cc.G.me.alive'))
        await B.wait_for_timeout(300)
        await B.screenshot(path='/tmp/shots/07_dead.png')
        print('killfeed A:', await A.inner_text('#killfeed'))
        print('A ammo:', await A.inner_text('#ammo'))
        await A.keyboard.press('KeyR'); await A.wait_for_timeout(300)
        print('A reloading:', await A.evaluate('__cc.weapons.reloading'))
        await B.wait_for_timeout(5200)
        print('B respawned alive:', await B.evaluate('__cc.G.me.alive'), 'hp', await B.evaluate('__cc.G.me.hp'))
        await A.keyboard.down('Tab'); await A.wait_for_timeout(200)
        await A.screenshot(path='/tmp/shots/08_scoreboard.png'); await A.keyboard.up('Tab')
        # pickup test: nearest pickup to A
        pk = await A.evaluate("""(() => { const cc = __cc; const f = cc.walker.feet; let best=null, bd=1e9;
          for (const it of cc.pickups.items) { if (it.def.kind!=='weapon' || it.def.p[1] > 2) continue; const d = Math.hypot(it.def.p[0]-f.x, it.def.p[2]-f.z); if (d<bd) {bd=d; best=it.def;} } return best; })()""")
        print('walking to pickup', pk['weapon'], pk['p'])
        await A.evaluate(f"__walkTo({pk['p'][0]}, {pk['p'][2]} + 1.2)")
        await A.evaluate(f"__face({pk['p'][0]}, {pk['p'][1]}, {pk['p'][2]})")
        await A.wait_for_timeout(400)
        print('prompt:', await A.inner_text('#prompt'))
        await A.screenshot(path='/tmp/shots/09_pickup.png')
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(500)
        print('A slots:', await A.inner_text('#slots'))
        await A.screenshot(path='/tmp/shots/10_newgun.png')
        print('\n'.join(logs[-20:]) or 'no console errors')
        await b.close()
asyncio.run(main())
