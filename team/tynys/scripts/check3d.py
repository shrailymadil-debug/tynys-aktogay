"""Проверка 3D-сцены без GPU (headless Chromium, программный WebGL): страница открывается
без ошибок, данные из двойников приходят, кадр меняется. python check3d.py URL out.png"""
import asyncio, sys
from playwright.async_api import async_playwright


async def main(url, out):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1400, "height": 850})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_timeout(6000)
        await pg.click("#skip"); await pg.wait_for_timeout(3000)
        c1 = await pg.inner_text("#clock"); src = await pg.inner_text("#src")
        img1 = await pg.screenshot()
        await pg.wait_for_timeout(15000)
        c2 = await pg.inner_text("#clock"); img2 = await pg.screenshot(path=out)
        fps = await pg.evaluate("window.__tynys && window.__tynys.fps")
        await b.close()
    ok = not errs and c1 not in ("", "—") and c1 != c2 and img1 != img2
    print(f"3D: ошибки={errs} источник='{src}' время {c1} → {c2} fps≈{fps:.0f} кадр_меняется={img1 != img2}")
    print("3D OK" if ok else "3D FAIL"); sys.exit(0 if ok else 1)

asyncio.run(main(sys.argv[1], sys.argv[2]))
