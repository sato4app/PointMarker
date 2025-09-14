import { CanvasRenderer } from './core/Canvas.js';
import { PointManager } from './data/PointManager.js';
import { RouteManager } from './data/RouteManager.js';
import { SpotManager } from './data/SpotManager.js';
import { FileHandler } from './data/FileHandler.js';
import { InputManager } from './ui/InputManager.js';
import { LayoutManager } from './ui/LayoutManager.js';
import { CoordinateUtils } from './utils/Coordinates.js';
import { Validators } from './utils/Validators.js';
import { DragDropHandler } from './utils/DragDropHandler.js';
import { ResizeHandler } from './utils/ResizeHandler.js';

/**
 * PointMarkerアプリケーションのメインクラス
 */
export class PointMarkerApp {
    constructor() {
        // DOM要素の初期化
        this.canvas = document.getElementById('mapCanvas');
        
        // コアコンポーネントの初期化
        this.canvasRenderer = new CanvasRenderer(this.canvas);
        this.pointManager = new PointManager();
        this.routeManager = new RouteManager();
        this.spotManager = new SpotManager();
        this.fileHandler = new FileHandler();
        this.inputManager = new InputManager(this.canvas);
        this.layoutManager = new LayoutManager();
        this.dragDropHandler = new DragDropHandler();
        this.resizeHandler = new ResizeHandler();

        // 現在の画像情報
        this.currentImage = null;

        // ホバー状態管理
        this.isHoveringPoint = false;
        
        this.initializeCallbacks();
        this.initializeEventListeners();
        this.enableBasicControls();
    }

    /**
     * コンポーネント間のコールバックを設定
     */
    initializeCallbacks() {
        // ポイント管理のコールバック
        this.pointManager.setCallback('onChange', (points, skipRedrawInput = false) => {
            this.redrawCanvas();
            if (!skipRedrawInput) {
                this.inputManager.redrawInputBoxes(points);
            }
        });
        
        this.pointManager.setCallback('onCountChange', (count) => {
            document.getElementById('pointCount').textContent = count;
        });

        // ルート管理のコールバック
        this.routeManager.setCallback('onChange', () => {
            this.redrawCanvas();
        });
        
        this.routeManager.setCallback('onCountChange', (count) => {
            document.getElementById('waypointCount').textContent = count;
        });
        
        this.routeManager.setCallback('onStartEndChange', (data) => {
            document.getElementById('startPointInput').value = data.start;
            document.getElementById('endPointInput').value = data.end;
            
            // InputManagerに開始・終了ポイントの強調表示を更新
            const highlightIds = [];
            if (data.start && data.start.trim()) highlightIds.push(data.start);
            if (data.end && data.end.trim()) highlightIds.push(data.end);
            this.inputManager.setHighlightedPoints(highlightIds);
            
            this.redrawCanvas();
        });

        // スポット管理のコールバック
        this.spotManager.setCallback('onChange', (spots, skipRedrawInput = false) => {
            this.redrawCanvas();
            if (!skipRedrawInput) {
                this.inputManager.redrawSpotInputBoxes(spots || this.spotManager.getSpots());
            }
        });
        
        this.spotManager.setCallback('onCountChange', (count) => {
            document.getElementById('spotCount').textContent = count;
        });

        // キャンバスのみの再描画用コールバック（入力ボックス再生成なし）
        this.spotManager.setCallback('onCanvasRedraw', () => {
            this.redrawCanvas();
        });

        // 入力管理のコールバック
        this.inputManager.setCallback('onPointIdChange', (data) => {
            this.pointManager.updatePointId(data.index, data.id, data.skipFormatting, true);
            // 入力中の場合は表示更新をスキップ（入力ボックスの値はそのまま維持）
            if (!data.skipDisplay) {
                this.inputManager.updatePointIdDisplay(data.index, data.id);
            }
        });
        
        this.inputManager.setCallback('onPointRemove', (data) => {
            if (this.layoutManager.getCurrentEditingMode() === 'point') {
                this.pointManager.removePoint(data.index);
            }
        });
        
        // スポット名変更のコールバック
        this.inputManager.setCallback('onSpotNameChange', (data) => {
            // 入力中はスポット入力ボックス再生成をスキップ
            this.spotManager.updateSpotName(data.index, data.name, !!data.skipDisplay);
            // 入力中の場合は表示更新をスキップ（入力ボックスの値はそのまま維持）
            if (!data.skipDisplay) {
                this.inputManager.updateSpotNameDisplay(data.index, data.name);
            }
        });
        
        this.inputManager.setCallback('onSpotRemove', (data) => {
            if (this.layoutManager.getCurrentEditingMode() === 'spot') {
                this.spotManager.removeSpot(data.index);
            }
        });

        // レイアウト管理のコールバック
        this.layoutManager.setCallback('onLayoutChange', (layout) => {
            if (this.currentImage) {
                this.resizeHandler.debounceResize(() => {
                    this.handleWindowResize();
                }, 300);
            }
        });
        
        this.layoutManager.setCallback('onModeChange', (mode) => {
            this.inputManager.setEditMode(mode);
            if (mode === 'route') {
                // ルート編集モードに切り替えた時、既存の開始・終了ポイントを強調表示
                const startEndPoints = this.routeManager.getStartEndPoints();
                const highlightIds = [];
                if (startEndPoints.start && startEndPoints.start.trim()) highlightIds.push(startEndPoints.start);
                if (startEndPoints.end && startEndPoints.end.trim()) highlightIds.push(startEndPoints.end);
                this.inputManager.setHighlightedPoints(highlightIds);
            } else if (mode === 'spot') {
                // スポット編集モードに切り替えた時、スポット入力ボックスを表示
                this.inputManager.redrawSpotInputBoxes(this.spotManager.getSpots());
            }
            this.redrawCanvas();
        });
    }

    /**
     * イベントリスナーを設定
     */
    initializeEventListeners() {
        // 画像選択
        const imageInputLabel = document.querySelector('label[for="imageInput"]');
        imageInputLabel.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleImageSelection();
        });

        // キャンバスクリック
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // マウス移動（ホバー検出・ドラッグ処理）
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        

        // ポイント編集コントロール
        document.getElementById('clearBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.clearPoints();
        });
        
        document.getElementById('formatBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.formatAllPointIds();
        });
        
        document.getElementById('exportBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportPoints();
        });
        
        document.getElementById('jsonInput').addEventListener('change', (e) => this.handlePointJSONLoad(e));

        // ルート編集コントロール
        document.getElementById('clearRouteBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.clearRoute();
        });
        
        document.getElementById('exportRouteBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportRoute();
        });
        
        document.getElementById('routeJsonInput').addEventListener('change', (e) => this.handleRouteJSONLoad(e));

        // スポット編集コントロール
        document.getElementById('clearSpotBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.clearSpots();
        });
        
        document.getElementById('exportSpotBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportSpots();
        });
        
        document.getElementById('spotJsonInput').addEventListener('change', (e) => this.handleSpotJSONLoad(e));

        // 開始・終了ポイント入力
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');
        
        // input時は変換処理を一切行わない（フォーマット処理もしない）
        startPointInput.addEventListener('input', (e) => {
            const value = e.target.value;
            // 入力中は変換処理なし、フォーマット処理をスキップして設定
            this.routeManager.setStartPoint(value, true);
        });
        
        endPointInput.addEventListener('input', (e) => {
            const value = e.target.value;
            // 入力中は変換処理なし、フォーマット処理をスキップして設定
            this.routeManager.setEndPoint(value, true);
        });
        
        // blur時にX-nn形式のフォーマット処理を実行
        startPointInput.addEventListener('blur', (e) => {
            this.routeManager.setStartPoint(e.target.value);
            const newValue = this.routeManager.getStartEndPoints().start;
            e.target.value = newValue;
            
            // 開始・終了ポイント両方の検証フィードバック
            this.updateBothRoutePointsValidation();
        });
        
        endPointInput.addEventListener('blur', (e) => {
            this.routeManager.setEndPoint(e.target.value);
            const newValue = this.routeManager.getStartEndPoints().end;
            e.target.value = newValue;
            
            // 開始・終了ポイント両方の検証フィードバック
            this.updateBothRoutePointsValidation();
        });

        // ウィンドウリサイズ
        window.addEventListener('resize', () => {
            if (this.currentImage) {
                this.resizeHandler.debounceResize(() => {
                    this.handleWindowResize();
                }, 100);
            }
        });
    }

    /**
     * 基本コントロールを有効化
     */
    enableBasicControls() {
        // 初期状態では画像読み込み前なので無効化
    }

    /**
     * 画像読み込み後のコントロールを有効化
     */
    enableImageControls() {
        document.getElementById('clearBtn').disabled = false;
        document.getElementById('formatBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
    }

    /**
     * 画像選択処理
     */
    async handleImageSelection() {
        try {
            const result = await this.fileHandler.selectImage();
            await this.processLoadedImage(result.image, result.fileName);
        } catch (error) {
            if (error.message !== 'ファイル選択がキャンセルされました') {
                console.error('画像選択エラー:', error);
                alert('画像選択中にエラーが発生しました: ' + error.message);
            }
        }
    }

    /**
     * 読み込まれた画像を処理
     * @param {HTMLImageElement} image - 読み込まれた画像
     * @param {string} fileName - ファイル名
     */
    async processLoadedImage(image, fileName) {
        this.currentImage = image;
        this.canvasRenderer.setImage(image);
        this.canvasRenderer.setupCanvas(this.layoutManager.getCurrentLayout());
        this.canvasRenderer.drawImage();
        this.enableImageControls();
        this.layoutManager.setDefaultPointMode();
    }

    /**
     * 指定座標上のオブジェクト（ポイント/スポット）を検出
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {{type: string, index: number} | null} 検出されたオブジェクト情報
     */
    findObjectAtMouse(mouseX, mouseY) {
        // スポットを先にチェック（ポイントより大きいため）
        const spotIndex = this.spotManager.findSpotAt(mouseX, mouseY, 10);
        if (spotIndex !== -1) {
            return { type: 'spot', index: spotIndex };
        }

        // ポイントをチェック
        const points = this.pointManager.getPoints();
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const dx = mouseX - point.x;
            const dy = mouseY - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= 8) {
                return { type: 'point', index: i };
            }
        }

        return null;
    }

    /**
     * ポイントがマウス座標上にあるか検出（後方互換性のため）
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {number} ポイントのインデックス、ない場合は-1
     */
    findPointAtMouse(mouseX, mouseY) {
        const result = this.findObjectAtMouse(mouseX, mouseY);
        return (result && result.type === 'point') ? result.index : -1;
    }

    /**
     * スポットがマウス座標上にあるか検出（後方互換性のため）
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {number} スポットのインデックス、ない場合は-1
     */
    findSpotAtMouse(mouseX, mouseY) {
        const result = this.findObjectAtMouse(mouseX, mouseY);
        return (result && result.type === 'spot') ? result.index : -1;
    }


    /**
     * キャンバスマウス移動処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseMove(event) {
        if (!this.currentImage) return;

        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas);

        // ドラッグ中の処理
        if (this.dragDropHandler.updateDrag(coords.x, coords.y, this.pointManager, this.spotManager)) {
            this.redrawCanvas();
            return;
        }

        // ホバー処理
        const hasObject = this.findObjectAtMouse(coords.x, coords.y) !== null;
        this.updateCursor(hasObject);
    }

    /**
     * カーソル状態を更新
     * @param {boolean} hasObject - オブジェクト上にマウスがあるか
     */
    updateCursor(hasObject) {
        if (hasObject !== this.isHoveringPoint) {
            this.canvas.style.cursor = 'crosshair';
            this.isHoveringPoint = hasObject;
        }
    }

    /**
     * キャンバスマウスダウン処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseDown(event) {
        if (!this.currentImage) return;

        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas);
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        if (!objectInfo) return;

        // 適切なモードでのドラッグ開始をチェック
        const canDrag = (objectInfo.type === 'point' && mode === 'point') ||
                        (objectInfo.type === 'spot' && mode === 'spot');

        if (canDrag) {
            const object = objectInfo.type === 'point'
                ? this.pointManager.getPoints()[objectInfo.index]
                : this.spotManager.getSpots()[objectInfo.index];

            this.dragDropHandler.startDrag(
                objectInfo.type,
                objectInfo.index,
                coords.x,
                coords.y,
                object
            );

            event.preventDefault();
        }
    }

    /**
     * キャンバスマウスアップ処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseUp(event) {
        this.dragDropHandler.endDrag(this.inputManager, this.pointManager);
    }

    /**
     * キャンバスクリック処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasClick(event) {
        if (!this.currentImage || this.dragDropHandler.isDraggingObject()) return;

        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas);
        const mode = this.layoutManager.getCurrentEditingMode();
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);

        // 既存オブジェクトクリック時の処理
        if (objectInfo) {
            this.handleExistingObjectClick(objectInfo, mode);
            return;
        }

        // 新規オブジェクト作成
        this.handleNewObjectCreation(coords, mode);
    }

    /**
     * 既存オブジェクトクリック時の処理
     * @param {Object} objectInfo - オブジェクト情報
     * @param {string} mode - 編集モード
     */
    handleExistingObjectClick(objectInfo, mode) {
        if (objectInfo.type === 'point' && mode === 'point') {
            this.focusInputForPoint(objectInfo.index);
        } else if (objectInfo.type === 'spot' && mode === 'spot') {
            this.focusInputForSpot(objectInfo.index);
        }
    }

    /**
     * 新規オブジェクト作成処理
     * @param {Object} coords - 座標
     * @param {string} mode - 編集モード
     */
    handleNewObjectCreation(coords, mode) {
        switch (mode) {
            case 'route':
                this.routeManager.addRoutePoint(coords.x, coords.y);
                break;
            case 'point':
                this.createNewPoint(coords);
                break;
            case 'spot':
                this.createNewSpot(coords);
                break;
        }
    }

    /**
     * 新規ポイント作成
     * @param {Object} coords - 座標
     */
    createNewPoint(coords) {
        this.pointManager.removeTrailingEmptyUserPoints();
        this.pointManager.addPoint(coords.x, coords.y);
        const newIndex = this.pointManager.getPoints().length - 1;
        setTimeout(() => this.focusInputForPoint(newIndex), 30);
    }

    /**
     * 新規スポット作成
     * @param {Object} coords - 座標
     */
    createNewSpot(coords) {
        this.spotManager.removeTrailingEmptySpots();
        this.spotManager.addSpot(coords.x, coords.y);
        const newIndex = this.spotManager.getSpots().length - 1;
        setTimeout(() => this.focusInputForSpot(newIndex), 30);
    }

    /**
     * キャンバスを再描画
     */
    redrawCanvas() {
        const mode = this.layoutManager.getCurrentEditingMode();
        const routePoints = this.routeManager.getStartEndPoints();
        
        this.canvasRenderer.redraw(
            this.pointManager.getPoints(),
            this.routeManager.getRoutePoints(),
            this.spotManager.getSpots(),
            {
                showRouteMode: mode === 'route',
                startPointId: routePoints.start,
                endPointId: routePoints.end
            }
        );
    }

    /**
     * ポイントをクリア
     */
    clearPoints() {
        this.pointManager.clearPoints();
        this.inputManager.clearInputBoxes();
    }

    /**
     * ルートをクリア
     */
    clearRoute() {
        this.routeManager.clearRoute();
    }

    /**
     * スポットをクリア
     */
    clearSpots() {
        this.spotManager.clearSpots();
        this.inputManager.clearSpotInputBoxes();
    }

    /**
     * ポイントID名の重複チェック
     * @param {Array} points - ポイント配列
     * @returns {Object} {isValid: boolean, duplicates: Array<string>, message: string}
     */
    checkDuplicatePointIds(points) {
        const idCount = {};
        const duplicates = [];
        
        // 空でないIDのみをチェック対象にする
        points.forEach(point => {
            if (point.id && point.id.trim() !== '') {
                const id = point.id.trim();
                idCount[id] = (idCount[id] || 0) + 1;
                if (idCount[id] === 2) {
                    duplicates.push(id);
                }
            }
        });
        
        const isValid = duplicates.length === 0;
        let message = '';
        
        if (!isValid) {
            message = `重複するポイントID名が見つかりました: ${duplicates.join(', ')}\n` +
                     'ポイントID名を修正してから再度エクスポートしてください。';
        }
        
        return { isValid, duplicates, message };
    }

    /**
     * ポイントをJSON出力
     */
    async exportPoints() {
        const points = this.pointManager.getPoints();
        if (points.length === 0) {
            alert('ポイントが選択されていません');
            return;
        }

        // ポイントID名の重複チェック
        const duplicateCheck = this.checkDuplicatePointIds(points);
        if (!duplicateCheck.isValid) {
            alert(duplicateCheck.message);
            return;
        }

        try {
            const filename = `${this.fileHandler.getCurrentImageFileName()}_points.json`;
            await this.fileHandler.exportPointData(
                this.pointManager,
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height,
                filename
            );
        } catch (error) {
            console.error('エクスポートエラー:', error);
            alert('エクスポート中にエラーが発生しました');
        }
    }

    /**
     * 全ポイントID名を補正
     */
    formatAllPointIds() {
        this.pointManager.formatAllPointIds();
        this.inputManager.redrawInputBoxes(this.pointManager.getPoints());
        this.redrawCanvas();
    }

    /**
     * ルートをJSON出力
     */
    async exportRoute() {
        const routePoints = this.routeManager.getRoutePoints();
        if (routePoints.length === 0) {
            alert('ルートポイントが選択されていません');
            return;
        }

        const validation = this.routeManager.validateStartEndPoints(
            this.pointManager.getRegisteredIds()
        );
        
        if (!validation.isValid) {
            alert(validation.message);
            return;
        }

        try {
            const filename = this.routeManager.generateRouteFilename(
                this.fileHandler.getCurrentImageFileName()
            );
            
            await this.fileHandler.exportRouteData(
                this.routeManager,
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height,
                filename
            );
        } catch (error) {
            console.error('エクスポートエラー:', error);
            alert('エクスポート中にエラーが発生しました');
        }
    }

    /**
     * ポイントJSONファイル読み込み処理
     * @param {Event} event - ファイル選択イベント
     */
    async handlePointJSONLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }

        try {
            await this.fileHandler.importPointData(
                this.pointManager,
                file,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
        } catch (error) {
            console.error('JSON読み込みエラー:', error);
            alert('JSON読み込み中にエラーが発生しました: ' + error.message);
        } finally {
            event.target.value = '';
        }
    }

    /**
     * ルートJSONファイル読み込み処理
     * @param {Event} event - ファイル選択イベント
     */
    async handleRouteJSONLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }

        try {
            await this.fileHandler.importRouteData(
                this.routeManager,
                file,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
        } catch (error) {
            console.error('ルートJSON読み込みエラー:', error);
            alert('ルートJSON読み込み中にエラーが発生しました: ' + error.message);
        } finally {
            event.target.value = '';
        }
    }


    /**
     * ルートポイント入力フィールドの検証フィードバックを更新
     * @param {HTMLInputElement} inputElement - 入力要素
     * @param {string} value - 検証する値
     */
    updateRoutePointValidationFeedback(inputElement, value) {
        // 空の場合は正常（クリア）
        if (!value || value.trim() === '') {
            this.clearInputElementStyles(inputElement);
            return;
        }

        // 形式チェック
        if (!Validators.isValidPointIdFormat(value)) {
            this.setInputElementError(inputElement, 'X-nn形式で入力してください（例：A-01, J-12）');
            return;
        }

        // 既存ポイントIDの存在チェック
        const existingPointIds = this.pointManager.getRegisteredIds();
        if (!existingPointIds.includes(value)) {
            this.setInputElementError(inputElement,
                `ポイントID「${value}」は存在しません。先にポイント編集でポイントを作成してください。`,
                true);
        } else {
            this.clearInputElementStyles(inputElement);
        }
    }

    /**
     * 入力要素のスタイルをクリア
     * @param {HTMLInputElement} inputElement - 入力要素
     */
    clearInputElementStyles(inputElement) {
        inputElement.style.backgroundColor = '';
        inputElement.style.borderColor = '';
        inputElement.title = '';
    }

    /**
     * 入力要素にエラースタイルを設定
     * @param {HTMLInputElement} inputElement - 入力要素
     * @param {string} message - エラーメッセージ
     * @param {boolean} redBorder - 赤枠のみ表示するか
     */
    setInputElementError(inputElement, message, redBorder = false) {
        if (redBorder) {
            inputElement.style.backgroundColor = '';
            inputElement.style.borderColor = '#ff0000';
        } else {
            inputElement.style.backgroundColor = '#ffe4e4';
            inputElement.style.borderColor = '#ff6b6b';
        }
        inputElement.title = message;
    }

    /**
     * 開始・終了ポイント両方の検証を実行
     */
    updateBothRoutePointsValidation() {
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');
        const routePoints = this.routeManager.getStartEndPoints();
        const startValue = routePoints.start;
        const endValue = routePoints.end;

        // 個別の検証を実行
        this.updateRoutePointValidationFeedback(startPointInput, startValue);
        this.updateRoutePointValidationFeedback(endPointInput, endValue);

        // 重複チェック（両方が空でない場合のみ）
        if (startValue && endValue && startValue.trim() !== '' && endValue.trim() !== '') {
            if (startValue === endValue) {
                const message = '開始ポイントと終了ポイントは異なるポイントIDを指定してください。';
                this.setInputElementError(startPointInput, message, true);
                this.setInputElementError(endPointInput, message, true);
            }
        }
    }

    /**
     * ポイントIDが「X-nn」形式（英大文字1桁-数字2桁）かどうかをチェック
     * @param {string} value - 検証する値
     * @returns {boolean} 有効な形式かどうか
     */
    isValidPointIdFormat(value) {
        return Validators.isValidPointIdFormat(value);
    }

    /**
     * 指定したポイントに対応する入力フィールドにフォーカスを当てる
     * @param {number} pointIndex - ポイントのインデックス
     */
    focusInputForPoint(pointIndex) {
        const inputElement = document.querySelector(`input[data-point-index="${pointIndex}"]`);
        if (inputElement) {
            inputElement.focus();
            // カーソルを末尾に設定
            inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        }
    }

    /**
     * 指定したスポットに対応する入力フィールドにフォーカスを当てる
     * @param {number} spotIndex - スポットのインデックス
     */
    focusInputForSpot(spotIndex) {
        const inputElement = document.querySelector(`input[data-spot-index="${spotIndex}"]`);
        if (inputElement) {
            inputElement.focus();
            // カーソルを末尾に設定
            inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        }
    }

    /**
     * スポットをJSON出力
     */
    async exportSpots() {
        const spots = this.spotManager.getSpots();
        if (spots.length === 0) {
            alert('スポットが選択されていません');
            return;
        }

        try {
            const filename = this.spotManager.generateSpotFilename(
                this.fileHandler.getCurrentImageFileName()
            );
            
            await this.fileHandler.exportSpotData(
                this.spotManager,
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height,
                filename
            );
        } catch (error) {
            console.error('スポットエクスポートエラー:', error);
            alert('スポットエクスポート中にエラーが発生しました');
        }
    }

    /**
     * スポットJSONファイル読み込み処理
     * @param {Event} event - ファイル選択イベント
     */
    async handleSpotJSONLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }

        try {
            await this.fileHandler.importSpotData(
                this.spotManager,
                file,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
        } catch (error) {
            console.error('スポットJSON読み込みエラー:', error);
            alert('スポットJSON読み込み中にエラーが発生しました: ' + error.message);
        } finally {
            event.target.value = '';
        }
    }

    /**
     * ウィンドウリサイズ処理
     */
    handleWindowResize() {
        this.resizeHandler.handleResize(
            this.currentImage,
            this.canvas,
            this.canvasRenderer,
            this.layoutManager,
            this.pointManager,
            this.routeManager,
            this.spotManager,
            () => this.redrawCanvas()
        );
    }
}

// DOM読み込み完了後にアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new PointMarkerApp();
});