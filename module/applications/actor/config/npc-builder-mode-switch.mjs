/**
 * Smoothly hand off between NPC builder modes without dropping the user back to the top of the window.
 * @param {ApplicationV2} currentApp  Currently open builder application.
 * @param {typeof ApplicationV2} BuilderClass  Builder class for the target mode.
 * @returns {Promise<ApplicationV2>}
 */
export async function switchNpcBuilderMode(currentApp, BuilderClass) {
  const handoff = captureBuilderHandoff(currentApp);
  currentApp.element?.classList.add("npc-builder-switching");

  const nextApp = new BuilderClass({
    document: currentApp.document,
    position: handoff.position
  });
  const renderOptions = {
    force: true,
    position: handoff.position
  };

  if ( typeof currentApp._renderChild === "function" ) await currentApp._renderChild(nextApp, renderOptions);
  else await nextApp.render(renderOptions);

  restoreBuilderHandoff(nextApp, handoff);
  nextApp.element?.classList.add("npc-builder-entering");
  await waitForFrame();
  nextApp.element?.classList.remove("npc-builder-entering");

  await currentApp.close({ animate: false });
  return nextApp;
}

/* -------------------------------------------- */

/**
 * Capture position and scroll state from the current builder.
 * @param {ApplicationV2} app  Current builder application.
 * @returns {object}
 */
function captureBuilderHandoff(app) {
  return {
    position: capturePosition(app),
    scroll: {
      content: app.element?.querySelector(".window-content")?.scrollTop ?? 0,
      blueprint: app.element?.querySelector(".adversary-blueprint")?.scrollTop ?? 0,
      suggestions: app.element?.querySelector("[data-content-panel]:not([hidden]) .adversary-suggestions")?.scrollTop ?? 0,
      selected: app.element?.querySelector(".adversary-selected-list")?.scrollTop ?? 0
    }
  };
}

/* -------------------------------------------- */

/**
 * Capture numeric window position fields.
 * @param {ApplicationV2} app  Current builder application.
 * @returns {object}
 */
function capturePosition(app) {
  const position = {};
  for ( const key of ["top", "left", "width", "height", "scale"] ) {
    if ( typeof app.position?.[key] === "number" ) position[key] = app.position[key];
  }
  return position;
}

/* -------------------------------------------- */

/**
 * Restore scroll state on the newly rendered builder.
 * @param {ApplicationV2} app  Newly rendered builder application.
 * @param {object} handoff    Captured handoff state.
 */
function restoreBuilderHandoff(app, handoff) {
  const { scroll } = handoff;
  setScrollTop(app.element?.querySelector(".window-content"), scroll.content);
  setScrollTop(app.element?.querySelector(".adversary-blueprint"), scroll.blueprint);
  setScrollTop(app.element?.querySelector("[data-content-panel]:not([hidden]) .adversary-suggestions"), scroll.suggestions);
  setScrollTop(app.element?.querySelector(".adversary-selected-list"), scroll.selected);
}

/* -------------------------------------------- */

/**
 * Set scrollTop when an element exists.
 * @param {HTMLElement|null} element  Element to scroll.
 * @param {number} value              Scroll value.
 */
function setScrollTop(element, value) {
  if ( element ) element.scrollTop = value;
}

/* -------------------------------------------- */

/**
 * Wait for the browser to paint the newly rendered builder.
 * @returns {Promise<void>}
 */
function waitForFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
