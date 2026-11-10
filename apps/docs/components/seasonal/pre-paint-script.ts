/**
 * Runs while the HTML streams in, before the season bar paints, so a
 * `?season=off` preview never flashes the bar in on a full page load.
 *
 * A fixed string, with nothing built in at runtime: "season" is SEASON_PARAM
 * and "qrdx:season-override" is SEASON_OVERRIDE_STORAGE_KEY (lib/seasonal.ts).
 * tests/lib/season-bar-pre-paint.test.ts runs it and fails if they drift.
 */
export const SEASON_BAR_PRE_PAINT_SCRIPT =
  '(function(){try{var o=new URLSearchParams(location.search).get("season")||sessionStorage.getItem("qrdx:season-override");if(o==="off")document.documentElement.setAttribute("data-season-bar","off")}catch(e){}})()';
