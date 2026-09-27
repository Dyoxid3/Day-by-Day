// The cat is layered images of the same size that already line up: the body, the head on top of it, and
// (when it faces the camera) a face showing its expression.

export type CatExpression = 'default' | 'cool' | 'dazed' | 'satisfied' | 'excited' | 'sad' | 'defeated';

// Front = facing the camera (walking down the screen); back = facing away (walking up the screen)
export type CatFacing = 'front' | 'back';

export const catAppearance = {
    // Inside public/assets
    folder: 'PixelArt/Cat/',
    // Body sprite sheet: 4 frames per row, the front-facing row on top and the back-facing row below.
    // Each row: standing, idle (the in-between frame for breathing), then the two walking steps.
    bodySheetFile: 'catbodywalks.png',
    headFile: 'default_head.png',
    // Head used on the body's idle frame, facing either way
    idleHeadFile: 'catheadidleanimationt.png',
    faceFiles: {
        default: 'default_face.png',
        cool: 'cool_face.png',
        dazed: 'dazed_face.png',
        satisfied: 'satisfied_face.png',
        excited: 'excited_face.png',
        sad: 'sad_face.png',
        defeated: 'defeated_face.png'
    } satisfies Record<CatExpression, string>,
    // Frame numbers in the body sheet
    bodyFrames: {
        front: { stand: 0, idle: 1, firstStep: 2, secondStep: 3 },
        back: { stand: 4, idle: 5, firstStep: 6, secondStep: 7 }
    } satisfies Record<CatFacing, { stand: number, idle: number, firstStep: number, secondStep: number }>,
    // Size of each image / frame, in pixels
    frameSize: 48,
    // Pixel row just below the paws (where the cat touches the ground), and the top row of the head
    feetLine: 42,
    headTop: 5,
    // Walking goes step, stand, step, stand; this is how many of those frames play per second
    walkFramesPerSecond: 8,
    // Idle breathing: how long the cat holds its standing frame, then its idle frame
    idleStandMs: 900,
    idleBreathMs: 600
};

export const catTextureKeys = {
    bodySheet: 'cat-body-sheet',
    head: 'cat-head',
    idleHead: 'cat-head-idle'
};

export const catExpressions = Object.keys(catAppearance.faceFiles) as CatExpression[];

export function GetCatFaceTextureKey (expression: CatExpression): string
{
    return `cat-face-${expression}`;
}

export function GetCatAnimationKey (action: 'walk' | 'idle', facing: CatFacing): string
{
    return `cat-${action}-${facing}`;
}
