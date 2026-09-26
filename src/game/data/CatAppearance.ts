// The cat is three layered images of the same size that already line up: body, then head, then a face
// showing its expression. They're drawn on top of each other to make the whole cat.

export type CatExpression = 'default' | 'cool' | 'dazed' | 'satisfied' | 'excited' | 'sad' | 'defeated';

export const catAppearance = {
    // Inside public/assets
    folder: 'PixelArt/Cat/',
    bodyFile: 'default_body.png',
    headFile: 'default_head.png',
    faceFiles: {
        default: 'default_face.png',
        cool: 'cool_face.png',
        dazed: 'dazed_face.png',
        satisfied: 'satisfied_face.png',
        excited: 'excited_face.png',
        sad: 'sad_face.png',
        defeated: 'defeated_face.png'
    } satisfies Record<CatExpression, string>,
    // Size of each image, in pixels
    frameSize: 48,
    // Pixel row just below the paws (where the cat touches the ground), and the top row of the head
    feetLine: 42,
    headTop: 5
};

export const catTextureKeys = {
    body: 'cat-body',
    head: 'cat-head'
};

export const catExpressions = Object.keys(catAppearance.faceFiles) as CatExpression[];

export function GetCatFaceTextureKey (expression: CatExpression): string
{
    return `cat-face-${expression}`;
}
