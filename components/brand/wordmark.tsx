import {WarrantMark} from "./warrant-mark";
import "./brand.css";

/**
 * THE WORDMARK: the mark, then "Warrant" in Bodoni Moda 600, the engraver's face of a
 * certificate. `size` is the mark's height; the word is set a little smaller, as drawn.
 */
export function Wordmark({size = 28, withMark = true}: {size?: number; withMark?: boolean}) {
  return (
    <span className="wa-wordmark" style={{fontSize: Math.round(size * 0.9)}}>
      {withMark ? <WarrantMark size={size} /> : null}
      <span className="wa-wordmark-word">Warrant</span>
    </span>
  );
}
