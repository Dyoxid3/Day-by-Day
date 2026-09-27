import { Scene, GameObjects, Geom, Input, Scale, Scenes, Math as PhaserMath } from 'phaser';
import { GetNearestPixelPerfectZoom, GetNextPixelPerfectZoom } from './PixelSnapping';
import { GetScreenPixelsPerCssPixel } from './ScreenResolution';

// Speeds are the fraction of the remaining distance covered each frame (at 60fps): higher = snappier.
// Zoom settings are how many CSS pixels wide one art pixel is drawn. The camera converts them to the screen's real
// pixels and settles on a whole number of those (see PixelSnapping), so the pixel art stays crisp.
const cameraSettings = {
    // The default view zooms in until the framed area fills the visible screen, but no further than this
    defaultZoom: 3,
    // CSS px kept around the framed area when zooming out to fit it
    defaultViewPadding: 20,
    // How much closer than "just fits" the default view is (1 = the whole island fits exactly)
    defaultViewCloseness: 1.25,
    // Min zoom and the keep-view threshold are multiples of the current default zoom. Zooming out below the
    // default is allowed, but dragging while zoomed out still glides back to the default view.
    minZoomFactor: 0.5,
    keepViewZoomFactor: 1.5,
    maxZoom: 6,
    // Each scroll zooms one step (to the next whole pixel size). Scrolls closer together than this count as one,
    // so a trackpad's stream of tiny scrolls doesn't skip several steps at once.
    wheelStepCooldownMs: 120,
    zoomSmoothSpeed: 0.12,
    // How far past the framed area's edges the visible area may pan, in world px
    panMargin: 350,
    returnSpeed: 0.07,
    // Pointer must move this far (CSS px) before a press counts as a drag rather than a click
    dragThreshold: 4,
    // Double-clicking the cat zooms in this far (the pixel-art cat is small)
    focusZoom: 4,
    focusFollowSpeed: 0.08,
    doubleClickMs: 300,
    // The default view doesn't show the whole island, so it drifts to keep the cat in sight: how far from the
    // visible edges the cat is kept (world px), and how quickly the view follows
    keepCatInViewMargin: 24,
    keepCatInViewSpeed: 0.04,
    // UI covering more of the screen than this (like full-screen panels on a phone) isn't framed around
    maxFramedCoverFraction: 0.8,
    // Never zooms out further than this, however little of the screen is left
    minPossibleZoom: 0.1,
    // Once the zoom is this close to where it's heading, it lands there exactly, so pixels end up whole-sized
    zoomLandingDistance: 0.001
};

export class IslandCameraController
{
    private scene: Scene;
    private camera: Phaser.Cameras.Scene2D.Camera;
    private cat: GameObjects.Sprite;
    private framedArea: Phaser.Geom.Rectangle;
    private panLimits: Phaser.Geom.Rectangle;
    private coveredLeftFraction = 0;
    private coveredRightFraction = 0;
    private coveredBottomFraction = 0;
    // Where the zoom is easing to: always a pixel-perfect zoom, except mid-pinch while it follows the fingers
    private targetZoom = 1;
    private lastWheelStepTime = -Infinity;
    private isInteractionEnabled = true;
    private isFocusedOnCat = false;
    private isReturningToDefault = false;
    // In (or gliding back to) the default view, rather than a view the player dragged or zoomed to
    private isInDefaultView = true;
    private isDragging = false;
    private dragDistance = 0;
    private lastCatClickTime = 0;
    private zoomAnchorX = 0;
    private zoomAnchorY = 0;
    // Two-finger pinch on touch screens: zooms by how far the fingers spread, pans by where they move together
    private isPinching = false;
    private pinchStartDistance = 1;
    private pinchStartZoom = 1;
    private pinchMidpointX = 0;
    private pinchMidpointY = 0;

    constructor (scene: Scene, cat: GameObjects.Sprite, framedArea: Phaser.Geom.Rectangle)
    {
        this.scene = scene;
        this.camera = scene.cameras.main;
        this.cat = cat;
        this.framedArea = framedArea;

        const margin = cameraSettings.panMargin;

        this.panLimits = new Geom.Rectangle(
            framedArea.x - margin,
            framedArea.y - margin,
            framedArea.width + margin * 2,
            framedArea.height + margin * 2
        );

        this.SetTargetZoom(this.GetDefaultZoom());
        this.camera.setZoom(this.targetZoom);
        this.SnapScrollToDefaultView();

        cat.setInteractive({ useHandCursor: true });
        cat.on(Input.Events.GAMEOBJECT_POINTER_DOWN, this.HandleCatClick, this);

        scene.input.on(Input.Events.POINTER_DOWN, this.HandlePointerDown, this);
        scene.input.on(Input.Events.POINTER_MOVE, this.HandlePointerMove, this);
        scene.input.on(Input.Events.POINTER_UP, this.HandlePointerUp, this);
        scene.input.on(Input.Events.POINTER_UP_OUTSIDE, this.HandlePointerUp, this);
        scene.input.on(Input.Events.POINTER_WHEEL, this.HandleWheel, this);
        scene.scale.on(Scale.Events.RESIZE, this.HandleScreenResize, this);
        scene.events.on(Scenes.Events.UPDATE, this.HandleUpdate, this);
        scene.events.once(Scenes.Events.SHUTDOWN, this.Destroy, this);
    }

    FocusOnCat ()
    {
        this.isFocusedOnCat = true;
        this.isReturningToDefault = false;
        this.isInDefaultView = false;
        this.isDragging = false;
        this.SetTargetZoom(cameraSettings.focusZoom * GetScreenPixelsPerCssPixel());
    }

    ReturnToDefaultView ()
    {
        this.isFocusedOnCat = false;
        this.isReturningToDefault = true;
        this.isInDefaultView = true;
        this.SetTargetZoom(this.GetDefaultZoom());
    }

    // Call when UI covers part of the screen, so the camera frames things in the part still visible
    SetScreenInsets (leftFraction: number, bottomFraction: number, rightFraction = 0)
    {
        const maxCover = cameraSettings.maxFramedCoverFraction;
        const isSideCovered = leftFraction + rightFraction > maxCover;

        this.coveredLeftFraction = isSideCovered ? 0 : PhaserMath.Clamp(leftFraction, 0, 1);
        this.coveredRightFraction = isSideCovered ? 0 : PhaserMath.Clamp(rightFraction, 0, 1 - this.coveredLeftFraction);
        this.coveredBottomFraction = bottomFraction > maxCover ? 0 : PhaserMath.Clamp(bottomFraction, 0, 1);

        if (!this.isFocusedOnCat)
        {
            this.ReturnToDefaultView();
        }
    }

    // Jumps straight to the default view for the current screen insets, without easing
    SnapToDefaultView ()
    {
        this.isFocusedOnCat = false;
        this.isReturningToDefault = false;
        this.isInDefaultView = true;
        this.SetTargetZoom(this.GetDefaultZoom());
        this.camera.setZoom(this.targetZoom);
        this.SnapScrollToDefaultView();
        this.ClampVisibleAreaToPanLimits();
    }

    // Turns drag-panning and double-click-to-focus on or off (scroll zoom always works)
    SetInteractionEnabled (isEnabled: boolean)
    {
        this.isInteractionEnabled = isEnabled;

        if (!isEnabled)
        {
            this.isDragging = false;

            if (this.isFocusedOnCat)
            {
                this.ReturnToDefaultView();
            }
        }
    }

    private HandleScreenResize ()
    {
        if (!this.isFocusedOnCat && !this.isDragging)
        {
            this.ReturnToDefaultView();
        }
    }

    // The part of the screen not covered by UI, in game-screen coordinates
    private GetVisibleScreenRect ()
    {
        const x = this.camera.width * this.coveredLeftFraction;

        return {
            x,
            y: 0,
            width: this.camera.width * (1 - this.coveredRightFraction) - x,
            height: this.camera.height * (1 - this.coveredBottomFraction)
        };
    }

    // Rounded to the nearest pixel-perfect zoom, so it may show a little more or less than the settings ask for
    private GetDefaultZoom (): number
    {
        const pixelRatio = GetScreenPixelsPerCssPixel();
        const visibleRect = this.GetVisibleScreenRect();
        const padding = cameraSettings.defaultViewPadding * pixelRatio * 2;
        const fitZoomX = (visibleRect.width - padding) / this.framedArea.width;
        const fitZoomY = (visibleRect.height - padding) / this.framedArea.height;

        const closeZoom = Math.min(fitZoomX, fitZoomY) * cameraSettings.defaultViewCloseness;
        const zoom = Math.max(cameraSettings.minPossibleZoom, Math.min(cameraSettings.defaultZoom * pixelRatio, closeZoom));

        return this.GetPixelPerfectZoom(zoom);
    }

    private GetMaxZoom (): number
    {
        return Math.max(1, Math.floor(cameraSettings.maxZoom * GetScreenPixelsPerCssPixel()));
    }

    // The nearest zoom that keeps the pixel art crisp, no closer than the max zoom
    private GetPixelPerfectZoom (zoom: number): number
    {
        return Math.min(GetNearestPixelPerfectZoom(zoom), this.GetMaxZoom());
    }

    private SetTargetZoom (zoom: number)
    {
        this.targetZoom = this.GetPixelPerfectZoom(zoom);
    }

    // Scroll that puts a world point at the center of the visible screen area, at the given zoom
    private GetScrollToShowAtVisibleCenter (worldX: number, worldY: number, zoom: number)
    {
        const visibleRect = this.GetVisibleScreenRect();
        const screenX = visibleRect.x + visibleRect.width / 2;
        const screenY = visibleRect.y + visibleRect.height / 2;

        return {
            x: worldX - this.camera.width / 2 - (screenX - this.camera.width / 2) / zoom,
            y: worldY - this.camera.height / 2 - (screenY - this.camera.height / 2) / zoom
        };
    }

    private SnapScrollToDefaultView ()
    {
        const center = this.GetDefaultViewCenter();
        const scroll = this.GetScrollToShowAtVisibleCenter(center.x, center.y, this.camera.zoom);

        this.camera.setScroll(scroll.x, scroll.y);
    }

    // The point the default view centers on: the middle of the island, moved just enough to keep the cat in
    // sight (the default view is close enough that it doesn't show the whole island)
    private GetDefaultViewCenter ()
    {
        const center = { x: this.framedArea.centerX, y: this.framedArea.centerY };

        // Not during boat trips or while placing items, when the camera is meant to hold still
        if (!this.isInteractionEnabled)
        {
            return center;
        }

        const visibleRect = this.GetVisibleScreenRect();
        const zoom = this.GetDefaultZoom();
        const margin = cameraSettings.keepCatInViewMargin;
        const halfVisibleWidth = visibleRect.width / zoom / 2;
        const halfVisibleHeight = visibleRect.height / zoom / 2;
        const catLeft = this.cat.x - this.cat.displayWidth / 2 - margin;
        const catRight = this.cat.x + this.cat.displayWidth / 2 + margin;
        const catTop = this.cat.y - this.cat.displayHeight * this.cat.originY - margin;
        const catBottom = this.cat.y + this.cat.displayHeight * (1 - this.cat.originY) + margin;

        return {
            x: ClampToShow(center.x, catLeft, catRight, halfVisibleWidth),
            y: ClampToShow(center.y, catTop, catBottom, halfVisibleHeight)
        };
    }

    private HandleCatClick ()
    {
        if (!this.isInteractionEnabled)
        {
            return;
        }

        const now = this.scene.time.now;

        if (now - this.lastCatClickTime <= cameraSettings.doubleClickMs)
        {
            this.lastCatClickTime = 0;
            this.FocusOnCat();
        }
        else
        {
            this.lastCatClickTime = now;
        }
    }

    private HandlePointerDown (_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[])
    {
        if (!this.isInteractionEnabled)
        {
            return;
        }

        if (this.isFocusedOnCat)
        {
            if (!currentlyOver.includes(this.cat))
            {
                this.ReturnToDefaultView();
            }
            return;
        }

        // Grabbing mid-return freezes the camera where it is so the drag continues from there (settling on the
        // nearest pixel-perfect zoom if it was mid-zoom)
        this.isReturningToDefault = false;
        this.SetTargetZoom(this.camera.zoom);
        this.isDragging = true;
        this.dragDistance = 0;
    }

    private HandlePointerMove (pointer: Phaser.Input.Pointer)
    {
        const pinchFingers = this.GetPinchFingers();

        if (pinchFingers)
        {
            this.UpdatePinch(pinchFingers[0], pinchFingers[1]);
            return;
        }

        if (!this.isDragging || !pointer.isDown)
        {
            return;
        }

        const deltaX = pointer.x - pointer.prevPosition.x;
        const deltaY = pointer.y - pointer.prevPosition.y;

        this.dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
        this.camera.scrollX -= deltaX / this.camera.zoom;
        this.camera.scrollY -= deltaY / this.camera.zoom;

        // A real drag (not just a click) leaves the default view until the camera glides back
        if (this.IsFarEnoughToDrag())
        {
            this.isInDefaultView = false;
        }
    }

    // The two fingers touching the screen, when there are two
    private GetPinchFingers (): [ Phaser.Input.Pointer, Phaser.Input.Pointer ] | undefined
    {
        if (!this.isInteractionEnabled || this.isFocusedOnCat)
        {
            return undefined;
        }

        const fingers = this.scene.input.manager.pointers.filter(pointer => pointer.isDown && pointer.wasTouch);

        return fingers.length >= 2 ? [ fingers[0], fingers[1] ] : undefined;
    }

    private UpdatePinch (firstFinger: Phaser.Input.Pointer, secondFinger: Phaser.Input.Pointer)
    {
        const distance = Math.max(1, PhaserMath.Distance.Between(firstFinger.x, firstFinger.y, secondFinger.x, secondFinger.y));
        const midpointX = (firstFinger.x + secondFinger.x) / 2;
        const midpointY = (firstFinger.y + secondFinger.y) / 2;

        if (this.isPinching)
        {
            // Both fingers moving together pans the view
            this.camera.scrollX -= (midpointX - this.pinchMidpointX) / this.camera.zoom;
            this.camera.scrollY -= (midpointY - this.pinchMidpointY) / this.camera.zoom;
        }
        else
        {
            this.isPinching = true;
            this.isInDefaultView = false;
            this.isDragging = false;
            this.isReturningToDefault = false;
            this.pinchStartDistance = distance;
            this.pinchStartZoom = this.camera.zoom;
        }

        const minZoom = this.GetDefaultZoom() * cameraSettings.minZoomFactor;

        // Zooms toward the point between the fingers, like scroll-zoom does toward the mouse. Follows the fingers
        // exactly, then settles on a pixel-perfect zoom when they lift.
        this.targetZoom = PhaserMath.Clamp(this.pinchStartZoom * (distance / this.pinchStartDistance), minZoom, this.GetMaxZoom());
        this.zoomAnchorX = midpointX;
        this.zoomAnchorY = midpointY;
        this.pinchMidpointX = midpointX;
        this.pinchMidpointY = midpointY;
    }

    private HandlePointerUp ()
    {
        // Lifting a finger ends the pinch; the view stays about where it was pinched to
        if (this.isPinching)
        {
            this.isPinching = false;
            this.SetTargetZoom(this.targetZoom);
            return;
        }

        if (!this.isDragging)
        {
            return;
        }

        this.isDragging = false;

        const keepViewZoom = this.GetDefaultZoom() * cameraSettings.keepViewZoomFactor;

        if (this.IsFarEnoughToDrag() && this.camera.zoom < keepViewZoom)
        {
            this.ReturnToDefaultView();
        }
    }

    private HandleWheel (pointer: Phaser.Input.Pointer, _currentlyOver: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number)
    {
        if (this.isFocusedOnCat)
        {
            return;
        }

        this.isReturningToDefault = false;
        this.isInDefaultView = false;
        this.zoomAnchorX = pointer.x;
        this.zoomAnchorY = pointer.y;

        // Trackpads send a stream of tiny scrolls, so only one step is taken per short burst
        const now = this.scene.time.now;

        if (deltaY === 0 || now - this.lastWheelStepTime < cameraSettings.wheelStepCooldownMs)
        {
            return;
        }

        this.lastWheelStepTime = now;

        // Every scroll steps to the next pixel-perfect zoom in or out, unless that's past the zoom limits
        const minZoom = this.GetDefaultZoom() * cameraSettings.minZoomFactor;
        const nextZoom = GetNextPixelPerfectZoom(this.targetZoom, deltaY < 0 ? 1 : -1);

        if (nextZoom > this.GetMaxZoom() || nextZoom < Math.min(minZoom, this.targetZoom))
        {
            return;
        }

        this.SetTargetZoom(nextZoom);
    }

    private IsFarEnoughToDrag (): boolean
    {
        return this.dragDistance >= cameraSettings.dragThreshold * GetScreenPixelsPerCssPixel();
    }

    private HandleUpdate (_time: number, delta: number)
    {
        const previousZoom = this.camera.zoom;
        let nextZoom = EaseToward(previousZoom, this.targetZoom, cameraSettings.zoomSmoothSpeed, delta);

        if (Math.abs(nextZoom - this.targetZoom) < cameraSettings.zoomLandingDistance)
        {
            nextZoom = this.targetZoom;
        }

        this.camera.setZoom(nextZoom);

        if (this.isFocusedOnCat)
        {
            this.EaseScrollToShow(this.cat.x, this.cat.y, cameraSettings.focusFollowSpeed, delta);
        }
        else if (this.isReturningToDefault)
        {
            const center = this.GetDefaultViewCenter();
            const target = this.EaseScrollToShow(center.x, center.y, cameraSettings.returnSpeed, delta);
            const hasArrived = Math.abs(this.camera.scrollX - target.x) < 0.5
                && Math.abs(this.camera.scrollY - target.y) < 0.5
                && Math.abs(this.camera.zoom - this.targetZoom) < 0.001;

            if (hasArrived)
            {
                this.camera.setZoom(this.targetZoom);
                this.SnapScrollToDefaultView();
                this.isReturningToDefault = false;
            }
        }
        else if (this.isInDefaultView && !this.isDragging && !this.isPinching)
        {
            // Settled in the default view: drifts along if the cat wanders toward the edge
            const center = this.GetDefaultViewCenter();

            this.EaseScrollToShow(center.x, center.y, cameraSettings.keepCatInViewSpeed, delta);
        }
        else
        {
            this.KeepAnchorFixedWhileZooming(previousZoom, nextZoom);
        }

        this.ClampVisibleAreaToPanLimits();
    }

    private EaseScrollToShow (worldX: number, worldY: number, speed: number, delta: number)
    {
        const target = this.GetScrollToShowAtVisibleCenter(worldX, worldY, this.camera.zoom);

        this.camera.scrollX = EaseToward(this.camera.scrollX, target.x, speed, delta);
        this.camera.scrollY = EaseToward(this.camera.scrollY, target.y, speed, delta);

        return target;
    }

    // Shifts scroll so the world point under the zoom anchor stays under it as zoom changes
    private KeepAnchorFixedWhileZooming (previousZoom: number, nextZoom: number)
    {
        const offsetFromCenterX = this.zoomAnchorX - this.camera.width / 2;
        const offsetFromCenterY = this.zoomAnchorY - this.camera.height / 2;
        const zoomChange = 1 / previousZoom - 1 / nextZoom;

        this.camera.scrollX += offsetFromCenterX * zoomChange;
        this.camera.scrollY += offsetFromCenterY * zoomChange;
    }

    // Keeps the uncovered part of the screen inside the pan limits (centered if it's larger than them)
    private ClampVisibleAreaToPanLimits ()
    {
        const zoom = this.camera.zoom;
        const visibleRect = this.GetVisibleScreenRect();
        const visibleLeft = this.camera.scrollX + this.camera.width / 2 + (visibleRect.x - this.camera.width / 2) / zoom;
        const visibleTop = this.camera.scrollY + this.camera.height / 2 + (visibleRect.y - this.camera.height / 2) / zoom;
        const visibleWidth = visibleRect.width / zoom;
        const visibleHeight = visibleRect.height / zoom;

        const clampedLeft = ClampSpan(visibleLeft, visibleWidth, this.panLimits.left, this.panLimits.right);
        const clampedTop = ClampSpan(visibleTop, visibleHeight, this.panLimits.top, this.panLimits.bottom);

        this.camera.scrollX += clampedLeft - visibleLeft;
        this.camera.scrollY += clampedTop - visibleTop;
    }

    private Destroy ()
    {
        this.scene.input.off(Input.Events.POINTER_DOWN, this.HandlePointerDown, this);
        this.scene.input.off(Input.Events.POINTER_MOVE, this.HandlePointerMove, this);
        this.scene.input.off(Input.Events.POINTER_UP, this.HandlePointerUp, this);
        this.scene.input.off(Input.Events.POINTER_UP_OUTSIDE, this.HandlePointerUp, this);
        this.scene.input.off(Input.Events.POINTER_WHEEL, this.HandleWheel, this);
        this.scene.scale.off(Scale.Events.RESIZE, this.HandleScreenResize, this);
        this.scene.events.off(Scenes.Events.UPDATE, this.HandleUpdate, this);
    }
}

// Frame-rate independent exponential ease: moves `speed` of the remaining gap per 60fps frame
function EaseToward (current: number, target: number, speed: number, delta: number): number
{
    const amount = 1 - Math.pow(1 - speed, delta / (1000 / 60));

    return current + (target - current) * amount;
}

// Moves a view's center (along one axis) just enough that [start, end] is inside a view of the given half-size,
// or centers on [start, end] if it's bigger than the view
function ClampToShow (center: number, start: number, end: number, halfViewSize: number): number
{
    if (end - start >= halfViewSize * 2)
    {
        return (start + end) / 2;
    }

    return PhaserMath.Clamp(center, end - halfViewSize, start + halfViewSize);
}

// Keeps a span [start, start + size] inside [min, max], centering it if it doesn't fit
function ClampSpan (start: number, size: number, min: number, max: number): number
{
    if (size >= max - min)
    {
        return (min + max) / 2 - size / 2;
    }

    return PhaserMath.Clamp(start, min, max - size);
}
