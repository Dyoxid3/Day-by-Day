import { catAppearance, type CatExpression } from '../game/data/CatAppearance';
import './CatPortrait.css';

// The player's cat, drawn in the HTML UI from the same pixel-art layers the island uses: the body's standing frame
// (from its sprite sheet), the head, and a face. Used where the cat hands the player a letter.
export function CreateCatPortrait (expression: CatExpression = 'default'): HTMLDivElement
{
    const portrait = document.createElement('div');
    portrait.className = 'cat-portrait';
    portrait.setAttribute('aria-hidden', 'true');

    const artFolder = `assets/${catAppearance.folder}`;
    const layers: [ string, string ][] = [
        [ 'is-body', catAppearance.bodySheetFile ],
        [ 'is-head', catAppearance.headFile ],
        [ 'is-face', catAppearance.faceFiles[expression] ]
    ];

    for (const [ layerClassName, fileName ] of layers)
    {
        const layer = document.createElement('span');
        layer.className = `cat-portrait-layer ${layerClassName}`;
        layer.style.backgroundImage = `url('${artFolder}${fileName}')`;
        portrait.append(layer);
    }

    return portrait;
}
