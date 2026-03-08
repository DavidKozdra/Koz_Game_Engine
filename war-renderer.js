(function initWarRenderer(root) {
  const SUIT_SYMBOLS = { S: "♠", H: "♥", D: "♦", C: "♣" };

  class WarRenderer {
    constructor() {}

    drawStateBackdrop(currentState, gameStates) {
      if (currentState === gameStates.SHOP) {
        this.drawGradientBackground("#2a2313", "#1a150d");
        return;
      }
      if (currentState === gameStates.GAMEOVER) {
        this.drawGradientBackground("#2a1217", "#12090c");
        return;
      }
      if (currentState === gameStates.TOUR) {
        this.drawGradientBackground("#152429", "#0a1116");
        return;
      }
      this.drawGradientBackground("#0b1f2d", "#091219");
    }

    drawBar(x, y, w, h, value, max, fg, bg, label) {
      const safeMax = Math.max(1, max || 1);
      const ratio = Math.max(0, Math.min(1, (value || 0) / safeMax));
      noStroke();
      fill(bg);
      rect(x, y, w, h, 9);
      fill(fg);
      rect(x, y, w * ratio, h, 9);

      fill("#e7f2fb");
      textAlign(LEFT, BOTTOM);
      textSize(Math.max(11, w * 0.035));
      text(label, x, y - 4);

      textAlign(RIGHT, BOTTOM);
      text(`${Math.max(0, Math.round(value || 0))} / ${Math.round(safeMax)}`, x + w, y - 4);
    }

    drawDamagePopups(battle, playerX, enemyX, y) {
      const popups = Array.isArray(battle.damagePopups) ? battle.damagePopups : [];
      for (const popup of popups) {
        const baseX = popup.target === "enemy" ? enemyX : playerX;
        const rise = (1 - popup.ttl / 0.9) * 36;
        const alpha = Math.max(0, Math.min(255, (popup.ttl / 0.9) * 255));
        fill(255, 117, 117, alpha);
        textAlign(CENTER, CENTER);
        textSize(Math.max(18, width * 0.022));
        text(`-${popup.amount}`, baseX, y - rise);
      }
    }

    drawGradientBackground(topColor, bottomColor) {
      for (let y = 0; y < height; y += 2) {
        const t = y / Math.max(1, height - 1);
        const c = lerpColor(color(topColor), color(bottomColor), t);
        stroke(c);
        line(0, y, width, y);
      }
    }

    drawCardFace(x, y, w, h, card, power, label, dim = false) {
      stroke(215, 229, 241, dim ? 35 : 70);
      strokeWeight(2);
      fill(244, 248, 252, dim ? 170 : 245);
      rect(x, y, w, h, 14);

      const isRed = card.suit === "H" || card.suit === "D";
      fill(isRed ? "#b22f2f" : "#1d2f44");
      noStroke();
      textAlign(LEFT, TOP);
      textSize(Math.max(14, w * 0.13));
      text(`${card.rank}${SUIT_SYMBOLS[card.suit] || card.suit}`, x + 10, y + 9);

      textAlign(CENTER, CENTER);
      textSize(Math.max(20, w * 0.23));
      text(`${power}`, x + w / 2, y + h / 2 + 2);

      textAlign(CENTER, TOP);
      textSize(Math.max(12, w * 0.1));
      fill("#2d3f52");
      text(label, x + w / 2, y + h + 7);
    }

    drawReadyScreen() {
      this.drawGradientBackground("#0b1f2d", "#091219");
      noStroke();
      fill("#e6edf5");
      textAlign(CENTER, CENTER);
      textSize(Math.min(56, width * 0.065));
      text("War Roguelike Showcase", width / 2, height * 0.23);

      textSize(Math.min(20, width * 0.026));
      fill("#9fb4c8");
      text("Engine demo: Save/Load, VFX, Audio, Events, AI utility, Minigames, and responsive UI.", width / 2, height * 0.31);

      const pulse = 0.52 + Math.sin(frameCount * 0.04) * 0.12;
      fill(122, 196, 255, 120 + pulse * 90);
      ellipse(width * 0.5, height * 0.52, 180 + pulse * 35, 34 + pulse * 8);
    }

    drawBattleScene(core, dt) {
      this.drawGradientBackground("#0b202a", "#0a141c");
      if (!core.run || !core.battle) {
        return;
      }

      const battle = core.battle;

      const clash = battle.lastClash;
      if (!clash || !clash.playerCard || !clash.enemyCard) return;

      const cardW = Math.max(92, Math.min(170, width * 0.14));
      const cardH = cardW * 1.38;
      const targetY = height * 0.38;
      const targetPlayerX = width * 0.53;
      const targetEnemyX = width * 0.73;
      const deckXLeft = width * 0.5;
      const deckXRight = width * 0.76;
      const deckY = height * 0.83;

      const anim = battle.cardAnim;
      if (anim && anim.active) {
        anim.progress += dt / Math.max(0.18, anim.duration);
        if (anim.progress >= 1) {
          anim.progress = 1;
          anim.active = false;
        }
      }

      const t = anim ? Math.min(1, anim.progress) : 1;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const px = lerp(deckXLeft, targetPlayerX, ease);
      const py = lerp(deckY, targetY, ease);
      const ex = lerp(deckXRight, targetEnemyX, ease);
      const ey = lerp(deckY, targetY, ease);

      this.drawCardFace(px, py, cardW, cardH, clash.playerCard, clash.playerPower, "You", t < 1);
      this.drawCardFace(ex, ey, cardW, cardH, clash.enemyCard, clash.enemyPower, clash.intent || "Enemy", t < 1);

      if ((battle.hitFlashPlayer || 0) > 0) {
        fill(255, 108, 108, Math.min(150, battle.hitFlashPlayer * 260));
        noStroke();
        rect(px - 6, py - 6, cardW + 12, cardH + 12, 16);
      }
      if ((battle.hitFlashEnemy || 0) > 0) {
        fill(255, 108, 108, Math.min(150, battle.hitFlashEnemy * 260));
        noStroke();
        rect(ex - 6, ey - 6, cardW + 12, cardH + 12, 16);
      }
      this.drawDamagePopups(battle, px + cardW * 0.5, ex + cardW * 0.5, targetY - 14);

      if (clash.war) {
        fill("#f5d08a");
        textSize(Math.max(13, width * 0.014));
        textAlign(CENTER, TOP);
        text(`WAR x${clash.warDepth}`, width * 0.64, targetY + cardH + 12);
      }
    }

    drawShopScreen(core, dt) {
      this.drawGradientBackground("#2a2313", "#1a150d");
      if (!core.run) return;

      if (core.shop && core.shop.shopAnim > 0) {
        core.shop.shopAnim += dt * 2.4;
        if (core.shop.shopAnim > 1) core.shop.shopAnim = 0;
      }

      fill("#f5ead8");
      noStroke();
      textAlign(LEFT, TOP);
      textSize(Math.max(20, width * 0.03));
      text("Shop And Route", 18, 16);

      textSize(Math.max(14, width * 0.017));
      fill("#e4cda4");
      text(`Gold ${core.run.gold} | HP ${core.run.health}/${core.run.maxHealth} | Deck ${core.run.deck.length}`, 18, 50);
      text(`Route: ${(core.shop?.selectedRoute || "battle").toUpperCase()} (set in UI panel)`, 18, 74);

      const r = core.shop?.shopAnim || 0;
      if (r > 0) {
        const glow = Math.sin(r * Math.PI) * 90;
        noFill();
        stroke(255, 212, 128, glow);
        strokeWeight(4);
        rect(12, 10, width - 24, 94, 14);
      }
    }

    drawPausedOverlay() {
      fill(3, 8, 14, 172);
      rect(0, 0, width, height);
      fill("#e6edf5");
      noStroke();
      textAlign(CENTER, CENTER);
      textSize(Math.max(28, width * 0.04));
      text("Paused", width / 2, height / 2);
    }

    drawGameOverScreen(core) {
      this.drawGradientBackground("#2a1217", "#12090c");
      fill("#f4d8dd");
      noStroke();
      textAlign(CENTER, TOP);
      textSize(Math.max(36, width * 0.05));
      text("Run Over", width / 2, height * 0.18);

      if (!core.run) return;

      fill("#e9b9c3");
      textSize(Math.max(18, width * 0.024));
      text(`Floors cleared: ${Math.max(0, core.run.floor - 1)}`, width / 2, height * 0.34);
      text(`Wins: ${core.run.wins} | Gold: ${core.run.gold}`, width / 2, height * 0.39);
      text(`${core.run.challengeMode ? "Challenge" : "Standard"} run`, width / 2, height * 0.44);
    }

    drawTourScreen(core) {
      this.drawGradientBackground("#152429", "#0a1116");
      const tour = root.WarCoreData?.TOUR_STEPS || [];
      const step = tour[core.tourStep] || tour[0] || { title: "Feature Tour", body: "" };

      fill("#dff3ff");
      noStroke();
      textAlign(CENTER, TOP);
      textSize(Math.max(30, width * 0.045));
      text(step.title, width / 2, height * 0.18);

      fill("#a6c5d7");
      textSize(Math.max(16, width * 0.022));
      text(step.body, width * 0.15, height * 0.32, width * 0.7, height * 0.3);

      fill("#79c8ff");
      textSize(Math.max(14, width * 0.018));
      text(`Step ${core.tourStep + 1}/${Math.max(1, tour.length)}`, width / 2, height * 0.76);
    }

    draw(core, currentState, dt, gameStates) {
      if (currentState === gameStates.RUNNING) {
        this.drawBattleScene(core, dt);
        return;
      }
      if (currentState === gameStates.PAUSED) {
        this.drawBattleScene(core, dt);
        return;
      }
      this.drawStateBackdrop(currentState, gameStates);
    }
  }

  root.WarRenderer = WarRenderer;
})(typeof window !== "undefined" ? window : globalThis);
