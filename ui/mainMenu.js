// MAIN MENU (extracted from ui.js)
uiManager.registerScreen("mainMenu", {
  validStates: [GameStates.MAIN_MENU],

  create: () => {
    const parent = createDiv().id("mainMenu").class("screen");

    // Background decoration
    const bgDecor = createDiv().class("menu-bg-decor");
    bgDecor.parent(parent);
    // Add stars
    for (let i = 0; i < 30; i++) {
      const star = createDiv().class("menu-star");
      star.style("--x", Math.random() * 100 + "%");
      star.style("--y", Math.random() * 100 + "%");
      star.style("--delay", Math.random() * 3 + "s");
      star.style("--duration", (2 + Math.random() * 2) + "s");
      star.parent(bgDecor);
    }

    // Title logo section
    const logoSection = createDiv().class("menu-logo-section");
    logoSection.parent(parent);

    createImg("./assets/working/bargain quest logo.gif", "Game Logo")
      .class("menu-logo")
      .style("image-rendering", "pixelated")
      .parent(logoSection);
    createElement("h1", "BARGAIN QUEST")
      .class("main-title")
      .parent(logoSection);

    // Subtitle shown directly beneath the main title
    createElement("div", "Sales and Sails")
      .addClass("menu-subtitle")
      .parent(logoSection);

    // Menu buttons section
    const buttonsSection = createDiv().class("menu-buttons");
    buttonsSection.parent(parent);

    const continueBtn = createButton("Continue")
      .parent(buttonsSection)
      .addClass("menu-btn")
      .mousePressed(() => {
        if (typeof loadExistingGame === 'function') {
          loadExistingGame();
        }
      });
    continueBtn.id("continueBtn");

    createButton("New Game")
      .parent(buttonsSection)
      .addClass("menu-btn")
      .mousePressed(() => {
        gameStateManager.setState(GameStates.NEW_GAME_CONFIG);
      });

    createButton("Settings")
      .parent(buttonsSection)
      .addClass("menu-btn")
      .mousePressed(() => {
        gameStateManager.setState(GameStates.SETTINGS);
      });

    createButton("Info")
      .parent(buttonsSection)
      .addClass("menu-btn")
      .mousePressed(() => {
        gameStateManager.setState(GameStates.INFO);
      });

    createButton("Custom Map Editor")
      .parent(buttonsSection)
      .addClass("menu-btn")
      .mousePressed(() => {
        if (!levelEditor) levelEditor = new LevelEditor();
        levelEditor.centreCamera();
        gameStateManager.setState(GameStates.LEVEL_EDITOR);
      });

    createButton("Credits")
      .parent(buttonsSection)
      .addClass("menu-btn")
      .mousePressed(() => {
        gameStateManager.setState(GameStates.CREDITS);
      });
    
    // Footer
    const footer = createP("");
    footer.class("menu-footer");
    footer.parent(parent);
    createSpan("v1.0").parent(footer);
    createSpan("  •  ").parent(footer);
    createA("https://github.com/DavidKozdra/Bargain-Quest", "GitHub", "_blank")
      .attribute("rel", "noopener noreferrer")
      .parent(footer);
      
    return parent;
  },

  show: () => {
    const m = select("#mainMenu");
    if (m) {
      m.addClass("screen-visible");
    }
    const madeBy = select(".menu-made-by");
    if (madeBy) madeBy.show();
    const githubLink = select(".menu-github-link");
    if (githubLink) githubLink.show();
    const cb = select("#continueBtn");
    if (cb) {
      const hasSave = typeof SaveSystem !== 'undefined' && SaveSystem.hasSave();
      cb.style("display", hasSave ? "block" : "none");
    }
  },

  hide: () => {
    const m = select("#mainMenu");
    if (m) {
      m.removeClass("screen-visible");
    }
    const madeBy = select(".menu-made-by");
    if (madeBy) madeBy.hide();
    const githubLink = select(".menu-github-link");
    if (githubLink) githubLink.hide();
  }
});
