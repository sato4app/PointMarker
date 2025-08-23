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
        
        this.initializeCallbacks();
        this.initializeEventListeners();
        this.enableBasicControls();
    }

    /**
     * コンポーネント間のコールバックを設定
     */
    initializeCallbacks() {
        // ポイント管理のコールバック
        this.pointManager.setCallback('onChange', (points) => {
            this.redrawCanvas();
            this.inputManager.redrawInputBoxes(points);
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
            this.redrawCanvas();
        });

        // 入力管理のコールバック
        this.inputManager.setCallback('onPointIdChange', (data) => {
            this.pointManager.updatePointId(data.index, data.id);
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

        // ポイント編集コントロール
        document.getElementById('clearBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.clearPoints();
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
        
        startPointInput.addEventListener('input', (e) => {
            const value = e.target.value.replace(/[a-z]/g, (match) => match.toUpperCase());
            e.target.value = value;
            this.routeManager.setStartPoint(value);
        });
        
        endPointInput.addEventListener('input', (e) => {
            const value = e.target.value.replace(/[a-z]/g, (match) => match.toUpperCase());
            e.target.value = value;
            this.routeManager.setEndPoint(value);
        });
        
        startPointInput.addEventListener('blur', (e) => {
            const formattedValue = this.routeManager.setStartPoint(e.target.value);
            e.target.value = this.routeManager.getStartEndPoints().start;
        });
        
        endPointInput.addEventListener('blur', (e) => {
            const formattedValue = this.routeManager.setEndPoint(e.target.value);
            e.target.value = this.routeManager.getStartEndPoints().end;
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
     * キャンバスクリック処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasClick(event) {
        if (!this.currentImage) return;
        
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas);
        const mode = this.layoutManager.getCurrentEditingMode();
        
        if (mode === 'route') {
            this.routeManager.addRoutePoint(coords.x, coords.y);
        } else if (mode === 'point') {
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