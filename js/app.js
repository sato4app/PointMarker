import { CanvasRenderer } from './core/Canvas.js';
import { PointManager } from './data/PointManager.js';
import { RouteManager } from './data/RouteManager.js';
import { FileHandler } from './data/FileHandler.js';
import { InputManager } from './ui/InputManager.js';
import { LayoutManager } from './ui/LayoutManager.js';
import { CoordinateUtils } from './utils/Coordinates.js';

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
        this.fileHandler = new FileHandler();
        this.inputManager = new InputManager(this.canvas);
        this.layoutManager = new LayoutManager();
        
        // 現在の画像情報
        this.currentImage = null;
        
        // ドラッグ状態管理
        this.isDragging = false;
        this.draggedPointIndex = -1;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
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

        // レイアウト管理のコールバック
        this.layoutManager.setCallback('onLayoutChange', (layout) => {
            if (this.currentImage) {
                setTimeout(() => this.handleWindowResize(), 300);
            }
        });
        
        this.layoutManager.setCallback('onModeChange', (mode) => {
            this.inputManager.setRouteEditMode(mode === 'route');
            if (mode === 'route') {
                // ルート編集モードに切り替えた時、既存の開始・終了ポイントを強調表示
                const startEndPoints = this.routeManager.getStartEndPoints();
                const highlightIds = [];
                if (startEndPoints.start && startEndPoints.start.trim()) highlightIds.push(startEndPoints.start);
                if (startEndPoints.end && startEndPoints.end.trim()) highlightIds.push(startEndPoints.end);
                this.inputManager.setHighlightedPoints(highlightIds);
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
            
            // 入力検証フィードバック
            this.updateInputValidationFeedback(e.target, newValue);
        });
        
        endPointInput.addEventListener('blur', (e) => {
            this.routeManager.setEndPoint(e.target.value);
            const newValue = this.routeManager.getStartEndPoints().end;
            e.target.value = newValue;
            
            // 入力検証フィードバック
            this.updateInputValidationFeedback(e.target, newValue);
        });

        // ウィンドウリサイズ
        window.addEventListener('resize', () => {
            if (this.currentImage) {
                setTimeout(() => this.handleWindowResize(), 100);
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
     * ポイントがマウス座標上にあるか検出
     * @param {number} mouseX - マウスX座標
     * @param {number} mouseY - マウスY座標
     * @returns {number} ポイントのインデックス、ない場合は-1
     */
    findPointAtMouse(mouseX, mouseY) {
        const points = this.pointManager.getPoints();
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const dx = mouseX - point.x;
            const dy = mouseY - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            // ポイントの半径（デフォルトは4）よりも少し大きめの範囲で検出
            if (distance <= 8) {
                return i;
            }
        }
        return -1;
    }

    /**
     * キャンバスマウス移動処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseMove(event) {
        if (!this.currentImage) return;
        
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas);
        const pointIndex = this.findPointAtMouse(coords.x, coords.y);
        
        if (this.isDragging && this.draggedPointIndex !== -1) {
            // ドラッグ中の場合、ポイント位置を更新
            const newX = coords.x - this.dragOffsetX;
            const newY = coords.y - this.dragOffsetY;
            
            const points = this.pointManager.getPoints();
            if (this.draggedPointIndex < points.length) {
                points[this.draggedPointIndex].x = Math.round(newX);
                points[this.draggedPointIndex].y = Math.round(newY);
                this.redrawCanvas();
            }
        } else if (pointIndex !== -1) {
            // ポイント上にマウスがある場合、カーソルを変更
            if (!this.isHoveringPoint) {
                this.canvas.style.cursor = 'move';
                this.isHoveringPoint = true;
            }
        } else {
            // ポイント上にない場合、カーソルをリセット
            if (this.isHoveringPoint) {
                this.canvas.style.cursor = 'default';
                this.isHoveringPoint = false;
            }
        }
    }

    /**
     * キャンバスマウスダウン処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseDown(event) {
        if (!this.currentImage) return;
        
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas);
        const pointIndex = this.findPointAtMouse(coords.x, coords.y);
        
        if (pointIndex !== -1 && this.layoutManager.getCurrentEditingMode() === 'point') {
            // ポイント上でクリック、ドラッグ開始
            this.isDragging = true;
            this.draggedPointIndex = pointIndex;
            
            const point = this.pointManager.getPoints()[pointIndex];
            this.dragOffsetX = coords.x - point.x;
            this.dragOffsetY = coords.y - point.y;
            
            event.preventDefault(); // テキスト選択などのデフォルト動作を防止
        }
    }

    /**
     * キャンバスマウスアップ処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseUp(event) {
        if (this.isDragging) {
            this.isDragging = false;
            
            // ポイント移動後に入力ボックスを再描画
            if (this.draggedPointIndex !== -1) {
                this.inputManager.redrawInputBoxes(this.pointManager.getPoints());
                // ポイントデータ変更を通知
                this.pointManager.notify('onChange', this.pointManager.getPoints());
            }
            
            this.draggedPointIndex = -1;
            this.dragOffsetX = 0;
            this.dragOffsetY = 0;
        }
    }

    /**
     * キャンバスクリック処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasClick(event) {
        if (!this.currentImage) return;
        
        // ドラッグ中のクリックは無視
        if (this.isDragging) {
            return;
        }
        
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas);
        const mode = this.layoutManager.getCurrentEditingMode();
        
        // ポイント上でのクリックはポイント追加しないが、入力フィールドにフォーカス
        const pointIndex = this.findPointAtMouse(coords.x, coords.y);
        if (pointIndex !== -1) {
            // 既存ポイントクリック時は対応する入力フィールドにフォーカス
            if (mode === 'point') {
                this.focusInputForPoint(pointIndex);
            }
            return;
        }
        
        if (mode === 'route') {
            this.routeManager.addRoutePoint(coords.x, coords.y);
        } else if (mode === 'point') {
            // ポイント編集モードでのみポイント追加を許可
            this.pointManager.removeTrailingEmptyUserPoints();
            const point = this.pointManager.addPoint(coords.x, coords.y);
            this.inputManager.createInputBox(point, this.pointManager.getPoints().length - 1, true);
        }
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
     * ポイントをJSON出力
     */
    async exportPoints() {
        const points = this.pointManager.getPoints();
        if (points.length === 0) {
            alert('ポイントが選択されていません');
            return;
        }

        try {
            const data = this.pointManager.exportToJSON(
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
            
            const filename = `${this.fileHandler.getCurrentImageFileName()}_points.json`;
            await this.fileHandler.saveJSONWithUserChoice(data, filename);
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
            const data = this.routeManager.exportToJSON(
                this.fileHandler.getCurrentImageFileName() + '.png',
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );
            
            const filename = this.routeManager.generateRouteFilename(
                this.fileHandler.getCurrentImageFileName()
            );
            
            await this.fileHandler.saveJSONWithUserChoice(data, filename);
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
            const data = await this.fileHandler.loadJsonFile(file);
            this.pointManager.loadFromJSON(
                data,
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
            const data = await this.fileHandler.loadJsonFile(file);
            this.routeManager.loadFromJSON(
                data,
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
     * 入力フィールドの検証フィードバックを更新
     * @param {HTMLInputElement} inputElement - 入力要素
     * @param {string} value - 検証する値
     */
    updateInputValidationFeedback(inputElement, value) {
        // Validatorsクラスをインポートしていないため、ここで直接チェック
        const isValidFormat = this.isValidPointIdFormat(value);
        
        if (!isValidFormat && value.trim() !== '') {
            // 無効な形式の場合は薄いピンクの背景色とツールチップを設定
            inputElement.style.backgroundColor = '#ffe4e4';
            inputElement.style.borderColor = '#ff6b6b';
            inputElement.title = 'X-nn形式で入力してください（例：A-01, J-12）';
        } else {
            // 有効な形式の場合は通常の表示に戻す
            inputElement.style.backgroundColor = '';
            inputElement.style.borderColor = '';
            inputElement.title = '';
        }
    }

    /**
     * ポイントIDが「X-nn」形式（英大文字1桁-数字2桁）かどうかをチェック
     * @param {string} value - 検証する値
     * @returns {boolean} 有効な形式かどうか
     */
    isValidPointIdFormat(value) {
        if (!value || value.trim() === '') {
            return true;
        }
        
        const validPattern = /^[A-Z]-\d{2}$/;
        return validPattern.test(value);
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
     * ウィンドウリサイズ処理
     */
    handleWindowResize() {
        if (!this.currentImage) return;
        
        const oldWidth = this.canvas.width;
        const oldHeight = this.canvas.height;
        
        this.canvasRenderer.setupCanvas(this.layoutManager.getCurrentLayout());
        
        const newWidth = this.canvas.width;
        const newHeight = this.canvas.height;
        
        if (oldWidth !== newWidth || oldHeight !== newHeight) {
            const scaleX = newWidth / oldWidth;
            const scaleY = newHeight / oldHeight;
            
            // ポイント座標のスケーリング
            this.pointManager.getPoints().forEach(point => {
                point.x = Math.round(point.x * scaleX);
                point.y = Math.round(point.y * scaleY);
            });
            
            // ルートポイント座標のスケーリング
            this.routeManager.getRoutePoints().forEach(point => {
                point.x = Math.round(point.x * scaleX);
                point.y = Math.round(point.y * scaleY);
            });
        }
        
        this.redrawCanvas();
    }
}

// DOM読み込み完了後にアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new PointMarkerApp();
});