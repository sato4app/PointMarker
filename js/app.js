import { CanvasRenderer } from './core/Canvas.js';
import { PointManager } from './data/PointManager.js';
import { RouteManager } from './data/RouteManager.js';
import { SpotManager } from './data/SpotManager.js';
import { FileHandler } from './data/FileHandler.js';
import { InputManager } from './ui/InputManager.js';
import { LayoutManager } from './ui/LayoutManager.js';
import { UIHelper } from './ui/UIHelper.js';
import { ValidationManager } from './ui/ValidationManager.js';
import { DuplicateDialog } from './ui/DuplicateDialog.js';
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
        this.validationManager = new ValidationManager();
        this.dragDropHandler = new DragDropHandler();
        this.resizeHandler = new ResizeHandler();
        this.duplicateDialog = new DuplicateDialog();

        // Firebase関連（グローバルスコープから取得）
        this.firebaseClient = window.firebaseClient || null;
        this.authManager = window.authManager || null;
        this.firestoreManager = window.firestoreManager || null;

        // プロジェクトID（画像ファイル名ベース）
        this.currentProjectId = null;

        // 現在の画像情報
        this.currentImage = null;

        // ホバー状態管理
        this.isHoveringPoint = false;

        // ファイルピッカーのアクティブ状態管理（重複呼び出し防止）
        this.isFilePickerActive = false;

        // ルート編集用の編集前ポイントID保存
        this.previousStartPoint = '';
        this.previousEndPoint = '';

        // スポットドラッグ開始時の座標保存（Firebase更新用）
        this.spotDragStartCoords = null;

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
            const highlightSpotNames = [];
            const registeredIds = this.pointManager.getRegisteredIds();

            // 開始ポイント
            if (data.start && data.start.trim()) {
                if (registeredIds.includes(data.start)) {
                    highlightIds.push(data.start);
                } else {
                    // ポイントIDとして存在しない場合、スポット名として扱う
                    highlightSpotNames.push(data.start);
                }
            }

            // 終了ポイント
            if (data.end && data.end.trim()) {
                if (registeredIds.includes(data.end)) {
                    highlightIds.push(data.end);
                } else {
                    // ポイントIDとして存在しない場合、スポット名として扱う
                    highlightSpotNames.push(data.end);
                }
            }

            this.inputManager.setHighlightedPoints(highlightIds);
            this.inputManager.setHighlightedSpotNames(highlightSpotNames);

            this.redrawCanvas();
        });

        // ルート一覧変更時のコールバック
        this.routeManager.setCallback('onRouteListChange', (routes) => {
            this.updateRouteDropdown(routes);
        });

        // ルート選択変更時のコールバック
        this.routeManager.setCallback('onSelectionChange', (index) => {
            // ドロップダウンの選択を更新
            const dropdown = document.getElementById('routeSelectDropdown');
            if (dropdown) {
                dropdown.value = index >= 0 ? index.toString() : '';
            }
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
            // blur時にIDが空白の場合はポイントを削除
            if (!data.skipFormatting && data.id.trim() === '') {
                // Firebaseからも削除するため、削除前に座標を取得
                const points = this.pointManager.getPoints();
                if (data.index >= 0 && data.index < points.length) {
                    const point = points[data.index];
                    // Firebase削除処理（非同期だが待たない）
                    this.deletePointFromFirebase(point.x, point.y);
                }
                // 画面から削除
                this.pointManager.removePoint(data.index);
                return;
            }

            // まずフォーマット処理を実行（blur時もinput時も）
            this.pointManager.updatePointId(data.index, data.id, data.skipFormatting, true);

            // blur時のみ、フォーマット後のIDで重複チェックを実行
            if (!data.skipFormatting && data.id.trim() !== '') {
                // フォーマット後のIDを取得
                const point = this.pointManager.getPoints()[data.index];
                const formattedId = point ? point.id : data.id;

                const registeredIds = this.pointManager.getRegisteredIds();

                // 自分以外で同じIDが存在するかチェック
                const hasDuplicate = registeredIds.some((id, idx) => {
                    return id === formattedId && idx !== data.index;
                });

                if (hasDuplicate) {
                    // 重複エラーを表示
                    const inputElement = document.querySelector(`input[data-point-index="${data.index}"]`);
                    if (inputElement) {
                        inputElement.style.backgroundColor = '#ffebee'; // ピンク背景
                        inputElement.style.borderColor = '#f44336'; // 赤枠
                        inputElement.style.borderWidth = '2px';
                        inputElement.title = `ポイントID "${formattedId}" は既に使用されています`;
                    }
                    UIHelper.showError(`ポイントID "${formattedId}" は既に使用されています。別のIDを入力してください。`);
                } else {
                    // 重複がない場合はエラー表示をクリア
                    const inputElement = document.querySelector(`input[data-point-index="${data.index}"]`);
                    if (inputElement) {
                        inputElement.style.backgroundColor = '';
                        inputElement.style.borderColor = '';
                        inputElement.style.borderWidth = '';
                        inputElement.title = '';
                    }

                    // 【リアルタイムFirebase更新】blur時、重複がなく、空白でない場合にFirebase更新
                    this.updatePointToFirebase(data.index);
                }
            }

            // 入力中の場合は表示更新をスキップ（入力ボックスの値はそのまま維持）
            if (!data.skipDisplay) {
                // フォーマット処理後の値を取得して表示
                const point = this.pointManager.getPoints()[data.index];
                if (point) {
                    this.inputManager.updatePointIdDisplay(data.index, point.id);
                }
            }
        });
        
        this.inputManager.setCallback('onPointRemove', (data) => {
            if (this.layoutManager.getCurrentEditingMode() === 'point') {
                this.pointManager.removePoint(data.index);
            }
        });
        
        // スポット名変更のコールバック
        this.inputManager.setCallback('onSpotNameChange', (data) => {
            // blur時にスポット名が空白の場合はスポットを削除
            if (!data.skipFormatting && data.name.trim() === '') {
                // Firebaseからも削除するため、削除前に座標を取得
                const spots = this.spotManager.getSpots();
                if (data.index >= 0 && data.index < spots.length) {
                    const spot = spots[data.index];
                    // Firebase削除処理（非同期だが待たない）
                    this.deleteSpotFromFirebase(spot.x, spot.y);
                }
                // 画面から削除
                this.spotManager.removeSpot(data.index);
                return;
            }

            // フォーマット処理を実行（blur時のみ、input時はスキップ）
            this.spotManager.updateSpotName(data.index, data.name, !!data.skipFormatting, !!data.skipDisplay);

            // blur時のみ、フォーマット後のスポット名でFirebase更新
            if (!data.skipFormatting && data.name.trim() !== '') {
                // 【リアルタイムFirebase更新】スポット名変更完了時にFirebase更新
                this.updateSpotToFirebase(data.index);
            }

            // 入力中の場合は表示更新をスキップ（入力ボックスの値はそのまま維持）
            if (!data.skipDisplay) {
                // フォーマット処理後の値を取得して表示
                const spot = this.spotManager.getSpots()[data.index];
                if (spot) {
                    this.inputManager.updateSpotNameDisplay(data.index, spot.name);
                }
            }
        });
        
        this.inputManager.setCallback('onSpotRemove', (data) => {
            if (this.layoutManager.getCurrentEditingMode() === 'spot') {
                // Firebaseからも削除するため、削除前に座標を取得
                const spots = this.spotManager.getSpots();
                if (data.index >= 0 && data.index < spots.length) {
                    const spot = spots[data.index];
                    // Firebase削除処理（非同期だが待たない）
                    this.deleteSpotFromFirebase(spot.x, spot.y);
                }
                // 画面から削除
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
            const pointIdCheckbox = document.getElementById('showPointIdsCheckbox');
            const spotNameCheckbox = document.getElementById('showSpotNamesCheckbox');

            if (mode === 'route') {
                // ルート編集モードに切り替えた時、既存の開始・終了ポイントを強調表示
                const startEndPoints = this.routeManager.getStartEndPoints();
                const highlightIds = [];
                if (startEndPoints.start && startEndPoints.start.trim()) highlightIds.push(startEndPoints.start);
                if (startEndPoints.end && startEndPoints.end.trim()) highlightIds.push(startEndPoints.end);
                this.inputManager.setHighlightedPoints(highlightIds);

                // チェックボックスをオンにしてポイントIDを表示
                if (pointIdCheckbox) {
                    pointIdCheckbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }

                // スポット名表示チェックボックスをOFFにする
                if (spotNameCheckbox && spotNameCheckbox.checked) {
                    spotNameCheckbox.checked = false;
                    this.handleSpotNameVisibilityChange(false);
                }
            } else if (mode === 'spot') {
                // スポット編集モードに切り替えた時、スポット入力ボックスを表示
                this.inputManager.redrawSpotInputBoxes(this.spotManager.getSpots());

                // ポイントIDポップアップを非表示
                this.handlePointIdVisibilityChange(false);
            } else if (mode === 'point') {
                // ポイント編集モードに切り替えた時、チェックボックスをオンにする
                if (pointIdCheckbox && !pointIdCheckbox.checked) {
                    pointIdCheckbox.checked = true;
                    this.handlePointIdVisibilityChange(true);
                }

                // スポット名表示チェックボックスをOFFにする
                if (spotNameCheckbox && spotNameCheckbox.checked) {
                    spotNameCheckbox.checked = false;
                    this.handleSpotNameVisibilityChange(false);
                }
            }

            this.redrawCanvas();
        });
    }

    /**
     * イベントリスナーを設定
     */
    initializeEventListeners() {
        // 画像選択
        const imageInputBtn = document.getElementById('imageInputBtn');
        imageInputBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleImageSelection();
        });

        // キャンバスクリック
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // マウス移動（ホバー検出・ドラッグ処理）
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        


        // ズーム・パンコントロール
        document.getElementById('zoomInBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleZoomIn();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleZoomOut();
        });

        document.getElementById('panUpBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanUp();
        });

        document.getElementById('panDownBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanDown();
        });

        document.getElementById('panLeftBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanLeft();
        });

        document.getElementById('panRightBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handlePanRight();
        });

        document.getElementById('resetViewBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleResetView();
        });

        // 開始・終了ポイント入力
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');

        // focus時に編集前の値を保存
        startPointInput.addEventListener('focus', (e) => {
            this.previousStartPoint = e.target.value.trim();
        });

        endPointInput.addEventListener('focus', (e) => {
            this.previousEndPoint = e.target.value.trim();
        });

        // blur時に半角・大文字変換とX-nn形式のフォーマット処理を実行
        startPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const newValue = this.handleRoutePointBlur(inputValue, 'start', this.previousStartPoint);
            e.target.value = newValue;
        });

        endPointInput.addEventListener('blur', (e) => {
            const inputValue = e.target.value.trim();
            const newValue = this.handleRoutePointBlur(inputValue, 'end', this.previousEndPoint);
            e.target.value = newValue;
        });

        // ルート選択ドロップダウン
        const routeDropdown = document.getElementById('routeSelectDropdown');
        if (routeDropdown) {
            routeDropdown.addEventListener('change', (e) => {
                const selectedIndex = e.target.value === '' ? -1 : parseInt(e.target.value);
                this.routeManager.selectRoute(selectedIndex);
            });
        }

        // ポイントID表示切り替えチェックボックス
        document.getElementById('showPointIdsCheckbox').addEventListener('change', (e) => {
            this.handlePointIdVisibilityChange(e.target.checked);
        });

        // スポット名表示切り替えチェックボックス
        document.getElementById('showSpotNamesCheckbox').addEventListener('change', (e) => {
            this.handleSpotNameVisibilityChange(e.target.checked);
        });

        // データ操作ボタン（読み込み・保存）
        document.getElementById('loadFromFirebaseBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.loadFromFirebase();
        });

        document.getElementById('saveToFirebaseBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.saveToFirebase();
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
        // データ操作ボタンを有効化
        document.getElementById('loadFromFirebaseBtn').disabled = false;
        document.getElementById('saveToFirebaseBtn').disabled = false;

        // ズーム・パンボタンを有効化
        document.getElementById('zoomInBtn').disabled = false;
        // ズームアウトは初期状態（1.0倍）では無効
        document.getElementById('zoomOutBtn').disabled = true;
        document.getElementById('panUpBtn').disabled = false;
        document.getElementById('panDownBtn').disabled = false;
        document.getElementById('panLeftBtn').disabled = false;
        document.getElementById('panRightBtn').disabled = false;
        document.getElementById('resetViewBtn').disabled = false;
    }

    /**
     * 画像選択処理
     */
    async handleImageSelection() {
        // 既にファイルピッカーが開いている場合は何もしない
        if (this.isFilePickerActive) {
            return;
        }

        try {
            this.isFilePickerActive = true;
            const result = await this.fileHandler.selectImage();
            await this.processLoadedImage(result.image, result.fileName);
        } catch (error) {
            if (error.message !== 'ファイル選択がキャンセルされました') {
                console.error('画像選択エラー:', error);
                alert('画像選択中にエラーが発生しました: ' + error.message);
            }
        } finally {
            this.isFilePickerActive = false;
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
        UIHelper.showMessage(`画像「${fileName}」を読み込みました`);
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
     * キャンバスマウス移動処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasMouseMove(event) {
        if (!this.currentImage) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);

        // ドラッグ中の処理
        if (this.dragDropHandler.updateDrag(coords.x, coords.y, this.pointManager, this.spotManager, this.routeManager)) {
            this.redrawCanvas();
            return;
        }

        // ホバー処理
        const mode = this.layoutManager.getCurrentEditingMode();
        let hasObject = this.findObjectAtMouse(coords.x, coords.y) !== null;

        // ルート編集モード時は中間点もホバー対象
        if (mode === 'route' && !hasObject) {
            hasObject = this.routeManager.findRoutePointAt(coords.x, coords.y) !== null;
        }

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

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        // ルート編集モードの場合、中間点ドラッグを優先チェック
        if (mode === 'route') {
            const routePointInfo = this.routeManager.findRoutePointAt(coords.x, coords.y);
            if (routePointInfo) {
                this.dragDropHandler.startDrag(
                    'routePoint',
                    routePointInfo.index,
                    coords.x,
                    coords.y,
                    routePointInfo.point
                );
                event.preventDefault();
                return;
            }
        }

        // ポイント・スポットのドラッグ処理
        const objectInfo = this.findObjectAtMouse(coords.x, coords.y);
        if (!objectInfo) return;

        // 適切なモードでのドラッグ開始をチェック
        const canDrag = (objectInfo.type === 'point' && mode === 'point') ||
                        (objectInfo.type === 'spot' && mode === 'spot');

        if (canDrag) {
            const object = objectInfo.type === 'point'
                ? this.pointManager.getPoints()[objectInfo.index]
                : this.spotManager.getSpots()[objectInfo.index];

            // スポットドラッグ開始時に元の座標を保存（Firebase更新用）
            if (objectInfo.type === 'spot') {
                this.spotDragStartCoords = {
                    x: object.x,
                    y: object.y
                };
            }

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
        // ポイントドラッグ終了時のコールバック
        const onPointDragEnd = (pointIndex) => {
            // 【リアルタイムFirebase更新】ポイント移動完了時にFirebase更新
            this.updatePointToFirebase(pointIndex);
        };

        // スポットドラッグ終了時のコールバック
        const onSpotDragEnd = async (spotIndex) => {
            // 【リアルタイムFirebase更新】スポット移動完了時にFirebase更新
            // 移動前の座標のデータを削除してから、新しい座標で追加
            if (this.spotDragStartCoords) {
                const spots = this.spotManager.getSpots();
                if (spotIndex >= 0 && spotIndex < spots.length) {
                    const currentSpot = spots[spotIndex];
                    // 座標が変わった場合のみ、古いデータを削除
                    if (this.spotDragStartCoords.x !== currentSpot.x ||
                        this.spotDragStartCoords.y !== currentSpot.y) {
                        await this.deleteSpotFromFirebase(this.spotDragStartCoords.x, this.spotDragStartCoords.y);
                    }
                }
                this.spotDragStartCoords = null; // リセット
            }
            // 新しい座標で更新/追加
            await this.updateSpotToFirebase(spotIndex);
        };

        this.dragDropHandler.endDrag(this.inputManager, this.pointManager, onPointDragEnd, onSpotDragEnd);
    }

    /**
     * キャンバスクリック処理
     * @param {MouseEvent} event - マウスイベント
     */
    handleCanvasClick(event) {
        if (!this.currentImage || this.dragDropHandler.isDraggingObject()) return;

        // ズーム・パン情報を取得
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();

        // マウス座標をキャンバス座標に変換（ズーム・パン逆変換適用）
        const coords = CoordinateUtils.mouseToCanvas(event, this.canvas, scale, offset.x, offset.y);
        const mode = this.layoutManager.getCurrentEditingMode();

        // ルート編集モードの場合、中間点上のクリックは無視（ドラッグ専用）
        if (mode === 'route') {
            const routePointInfo = this.routeManager.findRoutePointAt(coords.x, coords.y);
            if (routePointInfo) {
                return;
            }
        }

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
            UIHelper.focusInputForPoint(objectInfo.index);
        } else if (objectInfo.type === 'spot' && mode === 'spot') {
            UIHelper.focusInputForSpot(objectInfo.index);
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
        setTimeout(() => UIHelper.focusInputForPoint(newIndex), 30);
    }

    /**
     * 新規スポット作成
     * @param {Object} coords - 座標
     */
    createNewSpot(coords) {
        this.spotManager.removeTrailingEmptySpots();
        this.spotManager.addSpot(coords.x, coords.y);
        const newIndex = this.spotManager.getSpots().length - 1;
        setTimeout(() => UIHelper.focusInputForSpot(newIndex), 30);
    }

    /**
     * ルート選択ドロップダウンを更新
     * @param {Array} routes - ルート配列
     */
    updateRouteDropdown(routes) {
        const dropdown = document.getElementById('routeSelectDropdown');
        if (!dropdown) return;

        // 既存のオプションをクリア（最初の「-- ルートを選択 --」以外）
        dropdown.innerHTML = '<option value="">-- ルートを選択 --</option>';

        // ルートを追加
        routes.forEach((route, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.textContent = route.routeName || `${route.startPointId} → ${route.endPointId}`;
            dropdown.appendChild(option);
        });
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
                endPointId: routePoints.end,
                allRoutes: this.routeManager.getAllRoutes(),
                selectedRouteIndex: this.routeManager.selectedRouteIndex
            }
        );
    }

    /**
     * ルートポイント（開始・終了）のblur処理を統合処理
     * @param {string} inputValue - 入力値
     * @param {string} pointType - ポイントタイプ ('start' or 'end')
     * @param {string} previousValue - 前回の値
     * @returns {string} 設定された値
     */
    handleRoutePointBlur(inputValue, pointType, previousValue) {
        const isStartPoint = pointType === 'start';
        const setPointMethod = isStartPoint ? 'setStartPoint' : 'setEndPoint';
        const pointLabel = isStartPoint ? '開始ポイント' : '終了ポイント';

        // 入力値が空でない場合のみ処理
        if (inputValue !== '') {
            // まず元の入力値でスポット名の部分一致検索
            const matchingSpots = this.spotManager.findSpotsByPartialName(inputValue);

            if (matchingSpots.length === 1) {
                // 1件のみ該当する場合、そのスポット名を設定（フォーマット処理も適用）
                const formattedSpotName = Validators.formatPointId(matchingSpots[0].name);
                this.routeManager[setPointMethod](formattedSpotName);
            } else if (matchingSpots.length > 1) {
                // 複数件該当する場合、ポイントIDとしてフォーマット処理を試みる
                // （警告は表示せず、バリデーション時にピンク背景で表示）
                this.routeManager[setPointMethod](inputValue);
            } else {
                // スポット名が該当しない場合、ポイントIDとしてフォーマット処理
                this.routeManager[setPointMethod](inputValue);
            }
        } else {
            // 空の場合はそのまま設定
            this.routeManager[setPointMethod](inputValue);
        }

        const newValue = isStartPoint
            ? this.routeManager.getStartEndPoints().start
            : this.routeManager.getStartEndPoints().end;

        // 開始・終了ポイント両方の検証フィードバック（複数一致したスポット名を取得）
        const matchingSpots = ValidationManager.updateBothRoutePointsValidation(this.routeManager, this.pointManager, this.spotManager);

        // 複数一致したスポット名をエラー状態として設定
        const allMatchingSpotNames = [...matchingSpots.start, ...matchingSpots.end];
        this.inputManager.setErrorSpotNames(allMatchingSpotNames);

        // 値が変更された場合の処理（ブランクも含む）
        if (previousValue !== newValue) {
            this.checkRoutePointChange(previousValue, newValue, pointLabel);
            // ポイントID表示チェックボックスをオンにする
            const checkbox = document.getElementById('showPointIdsCheckbox');
            if (!checkbox.checked) {
                checkbox.checked = true;
                this.handlePointIdVisibilityChange(true);
            }
        }

        return newValue;
    }


    /**
     * ルートポイント変更チェック
     * @param {string} previousValue - 編集前の値
     * @param {string} newValue - 編集後の値
     * @param {string} pointType - ポイントタイプ（'開始ポイント' or '終了ポイント'）
     */
    checkRoutePointChange(previousValue, newValue, pointType) {
        // 値が変更され、かつ中間点が存在する場合
        if (previousValue !== newValue && this.routeManager.getRoutePoints().length > 0) {
            const waypointCount = this.routeManager.getRoutePoints().length;
            const message = `${pointType}が変更されました（${previousValue || '(空)'} → ${newValue || '(空)'}）。\n\n` +
                `ルート上の中間点（${waypointCount}個）をクリアしますか？`;

            if (confirm(message)) {
                this.routeManager.clearRoutePoints();
                UIHelper.showMessage(`${waypointCount}個の中間点をクリアしました`);
            }
        }
    }


    /**
     * ポイントID表示/非表示切り替え処理
     * @param {boolean} visible - 表示するかどうか
     */
    handlePointIdVisibilityChange(visible) {
        this.inputManager.setPointIdVisibility(visible);
    }

    /**
     * スポット名表示/非表示切り替え処理
     * @param {boolean} visible - 表示するかどうか
     */
    handleSpotNameVisibilityChange(visible) {
        // スポットデータを取得して渡す
        const spots = this.spotManager.getSpots();
        this.inputManager.setSpotNameVisibility(visible, spots);
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

    /**
     * ズーム処理（汎用）
     * @param {string} direction - 方向 ('in' or 'out')
     */
    handleZoom(direction) {
        if (direction === 'in') {
            this.canvasRenderer.zoomIn();
        } else if (direction === 'out') {
            this.canvasRenderer.zoomOut();
        }
        this.updateZoomButtonStates();
        this.updatePopupPositions();
        this.redrawCanvas();
    }

    /**
     * ズームイン処理
     */
    handleZoomIn() {
        this.handleZoom('in');
    }

    /**
     * ズームアウト処理
     */
    handleZoomOut() {
        this.handleZoom('out');
    }

    /**
     * ポップアップ位置を更新
     */
    updatePopupPositions() {
        const scale = this.canvasRenderer.getScale();
        const offset = this.canvasRenderer.getOffset();
        const points = this.pointManager.getPoints();
        const spots = this.spotManager.getSpots();

        this.inputManager.updateTransform(scale, offset.x, offset.y, points, spots);

        // チェックボックスの状態を反映（ポイントID）
        const checkbox = document.getElementById('showPointIdsCheckbox');
        if (checkbox && !checkbox.checked) {
            this.inputManager.setPointIdVisibility(false);
        }

        // スポット名の状態を再適用（強調表示とエラー状態を復元）
        this.inputManager.updateSpotInputsState();
    }

    /**
     * ズームボタンの状態を更新
     */
    updateZoomButtonStates() {
        const scale = this.canvasRenderer.getScale();
        const minScale = this.canvasRenderer.minScale;

        // 表示倍率が1.0倍（最小値）の時、ズームアウトボタンを無効化
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        if (scale <= minScale) {
            zoomOutBtn.disabled = true;
        } else {
            zoomOutBtn.disabled = false;
        }
    }

    /**
     * パン処理（汎用）
     * @param {string} direction - 方向 ('up', 'down', 'left', 'right')
     */
    handlePan(direction) {
        const panMethods = {
            'up': () => this.canvasRenderer.panUp(),
            'down': () => this.canvasRenderer.panDown(),
            'left': () => this.canvasRenderer.panLeft(),
            'right': () => this.canvasRenderer.panRight()
        };

        if (panMethods[direction]) {
            panMethods[direction]();
            this.updatePopupPositions();
            this.redrawCanvas();
        }
    }

    // 後方互換性のための個別メソッド
    handlePanUp() { this.handlePan('up'); }
    handlePanDown() { this.handlePan('down'); }
    handlePanLeft() { this.handlePan('left'); }
    handlePanRight() { this.handlePan('right'); }

    /**
     * 表示リセット処理
     */
    handleResetView() {
        this.canvasRenderer.resetTransform();
        this.updateZoomButtonStates();
        this.updatePopupPositions();
        this.redrawCanvas();
    }

    // ========================================
    // Firebase連携機能
    // ========================================

    /**
     * 単一ポイントをFirebaseにリアルタイム更新
     * @param {number} pointIndex - ポイントのインデックス
     */
    async updatePointToFirebase(pointIndex) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            console.log('[Firebase] Firestore manager not available');
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            console.log('[Firebase] No image loaded');
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            console.log('[Firebase] Cannot get project ID');
            return;
        }

        const points = this.pointManager.getPoints();
        if (pointIndex < 0 || pointIndex >= points.length) {
            console.log('[Firebase] Invalid point index:', pointIndex);
            return;
        }

        const point = points[pointIndex];

        // 空白IDのポイントは更新対象外
        if (!point.id || point.id.trim() === '') {
            console.log('[Firebase] Point ID is blank, skipping update. Index:', pointIndex);
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                point.x, point.y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // デバッグログ出力
            console.log(`[Firebase] Updating point - ID: "${point.id}", Canvas: (${point.x}, ${point.y}), Image: (${imageCoords.x}, ${imageCoords.y})`);

            // プロジェクトメタデータの存在確認・作成
            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                const metadata = {
                    projectName: projectId,
                    imageName: projectId + '.png',
                    imageWidth: this.currentImage.width,
                    imageHeight: this.currentImage.height
                };
                await window.firestoreManager.createProjectMetadata(projectId, metadata);
                console.log(`[Firebase] Created project metadata: ${projectId}`);
            }

            // 既存ポイントを検索
            const existingPoint = await window.firestoreManager.findPointById(projectId, point.id);

            if (existingPoint) {
                // 既存ポイントを更新
                await window.firestoreManager.updatePoint(projectId, existingPoint.firestoreId, {
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: point.index || 0,
                    isMarker: false
                });
                console.log(`[Firebase] Updated existing point: ${point.id} (firestoreId: ${existingPoint.firestoreId})`);
            } else {
                // 新規ポイントを追加
                const result = await window.firestoreManager.addPoint(projectId, {
                    id: point.id,
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: point.index || 0,
                    isMarker: false
                });

                if (result.status === 'success') {
                    console.log(`[Firebase] Added new point: ${point.id} (firestoreId: ${result.firestoreId})`);
                } else if (result.status === 'duplicate') {
                    console.warn(`[Firebase] Duplicate point detected: ${point.id}`);
                }
            }

        } catch (error) {
            console.error('[Firebase] Error updating point:', error);
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * 座標でポイントをFirebaseから削除
     * @param {number} x - キャンバスX座標
     * @param {number} y - キャンバスY座標
     */
    async deletePointFromFirebase(x, y) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            console.log('[Firebase] Firestore manager not available');
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            console.log('[Firebase] No image loaded');
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            console.log('[Firebase] Cannot get project ID');
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                x, y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // 座標でポイントを検索
            const existingPoint = await window.firestoreManager.findPointByCoords(
                projectId,
                imageCoords.x,
                imageCoords.y
            );

            if (existingPoint) {
                // Firebaseから削除
                await window.firestoreManager.deletePoint(projectId, existingPoint.firestoreId);

                // デバッグログ出力
                console.log(`[Firebase] Deleted point at coordinates - Canvas: (${x}, ${y}), Image: (${imageCoords.x}, ${imageCoords.y}), ID was: "${existingPoint.id || '(blank)'}"`);
            } else {
                console.log(`[Firebase] No point found at coordinates - Canvas: (${x}, ${y}), Image: (${imageCoords.x}, ${imageCoords.y})`);
            }

        } catch (error) {
            console.error('[Firebase] Error deleting point by coords:', error);
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * 単一スポットをFirebaseにリアルタイム更新
     * @param {number} spotIndex - スポットのインデックス
     */
    async updateSpotToFirebase(spotIndex) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            console.log('[Firebase] Firestore manager not available');
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            console.log('[Firebase] No image loaded');
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            console.log('[Firebase] Cannot get project ID');
            return;
        }

        const spots = this.spotManager.getSpots();
        if (spotIndex < 0 || spotIndex >= spots.length) {
            console.log('[Firebase] Invalid spot index:', spotIndex);
            return;
        }

        const spot = spots[spotIndex];

        // 空白名のスポットは更新対象外
        if (!spot.name || spot.name.trim() === '') {
            console.log('[Firebase] Spot name is blank, skipping update. Index:', spotIndex);
            // 空白名の場合は既存データがあれば削除
            await this.deleteSpotFromFirebase(spot.x, spot.y);
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                spot.x, spot.y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // デバッグログ出力（追加・更新時）
            console.log(`[Firebase] Updating spot - Name: "${spot.name}", Canvas: (${spot.x}, ${spot.y}), Image: (${imageCoords.x}, ${imageCoords.y})`);

            // プロジェクトメタデータの存在確認・作成
            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                const metadata = {
                    projectName: projectId,
                    imageName: projectId + '.png',
                    imageWidth: this.currentImage.width,
                    imageHeight: this.currentImage.height
                };
                await window.firestoreManager.createProjectMetadata(projectId, metadata);
                console.log(`[Firebase] Created project metadata: ${projectId}`);
            }

            // 既存スポットを検索（座標のみで検索）
            const existingSpot = await window.firestoreManager.findSpotByCoords(
                projectId,
                imageCoords.x,
                imageCoords.y
            );

            if (existingSpot) {
                // 既存スポットを更新（スポット名と座標を更新）
                await window.firestoreManager.updateSpot(projectId, existingSpot.firestoreId, {
                    name: spot.name,
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: spot.index || 0,
                    description: spot.description || '',
                    category: spot.category || ''
                });
                console.log(`[Firebase] Updated existing spot at coords - New name: "${spot.name}", Coords: (${imageCoords.x}, ${imageCoords.y}), firestoreId: ${existingSpot.firestoreId}`);
            } else {
                // 新規スポットを追加
                const result = await window.firestoreManager.addSpot(projectId, {
                    name: spot.name,
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: spot.index || 0,
                    description: spot.description || '',
                    category: spot.category || ''
                });

                if (result.status === 'success') {
                    console.log(`[Firebase] Added new spot: ${spot.name} (firestoreId: ${result.firestoreId})`);
                } else if (result.status === 'duplicate') {
                    console.warn(`[Firebase] Duplicate spot detected: ${spot.name}`);
                }
            }

        } catch (error) {
            console.error('[Firebase] Error updating spot:', error);
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * 座標でスポットをFirebaseから削除
     * @param {number} x - キャンバスX座標
     * @param {number} y - キャンバスY座標
     */
    async deleteSpotFromFirebase(x, y) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            console.log('[Firebase] Firestore manager not available');
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            console.log('[Firebase] No image loaded');
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            console.log('[Firebase] Cannot get project ID');
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                x, y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // 座標でスポットを検索
            const existingSpot = await window.firestoreManager.findSpotByCoords(
                projectId,
                imageCoords.x,
                imageCoords.y
            );

            if (existingSpot) {
                // Firebaseから削除
                await window.firestoreManager.deleteSpot(projectId, existingSpot.firestoreId);

                // デバッグログ出力（削除時）
                console.log(`[Firebase] Deleted spot at coordinates - Canvas: (${x}, ${y}), Image: (${imageCoords.x}, ${imageCoords.y}), Name was: "${existingSpot.name || '(blank)'}"`);
            } else {
                console.log(`[Firebase] No spot found at coordinates - Canvas: (${x}, ${y}), Image: (${imageCoords.x}, ${imageCoords.y})`);
            }

        } catch (error) {
            console.error('[Firebase] Error deleting spot by coords:', error);
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * 現在のデータをFirebaseに保存
     */
    async saveToFirebase() {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            UIHelper.showError('Firebase接続が利用できません');
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            UIHelper.showError('先に画像を読み込んでください');
            return;
        }

        try {
            // ポイントの重複チェック（JSONエクスポートと同じ）
            const points = this.pointManager.getPoints();
            const duplicateCheck = ValidationManager.checkDuplicatePointIds(points);
            if (!duplicateCheck.isValid) {
                UIHelper.showError(duplicateCheck.message);
                return;
            }

            // プロジェクトIDを画像ファイル名から取得
            const projectId = this.fileHandler.getCurrentImageFileName();
            if (!projectId) {
                UIHelper.showError('画像ファイル名を取得できません');
                return;
            }

            // プロジェクトメタデータを作成/更新
            const metadata = {
                projectName: projectId,
                imageName: projectId + '.png',
                imageWidth: this.currentImage.width,
                imageHeight: this.currentImage.height
            };

            const existingProject = await window.firestoreManager.getProjectMetadata(projectId);
            if (!existingProject) {
                await window.firestoreManager.createProjectMetadata(projectId, metadata);
            } else {
                await window.firestoreManager.updateProjectMetadata(projectId, metadata);
            }

            // 既存データを全て削除（上書き保存）
            const existingPoints = await window.firestoreManager.getPoints(projectId);
            for (const point of existingPoints) {
                await window.firestoreManager.deletePoint(projectId, point.firestoreId);
            }

            const existingRoutes = await window.firestoreManager.getRoutes(projectId);
            for (const route of existingRoutes) {
                await window.firestoreManager.deleteRoute(projectId, route.firestoreId);
            }

            const existingSpots = await window.firestoreManager.getSpots(projectId);
            for (const spot of existingSpots) {
                await window.firestoreManager.deleteSpot(projectId, spot.firestoreId);
            }

            // 保存カウンター
            let savedPoints = 0;
            let savedRoutes = 0;
            let savedSpots = 0;

            // ポイントを保存（キャンバス座標→画像座標に変換）
            for (const point of points) {
                // 空白IDのポイントはスキップ（JSONエクスポートと同じ）
                if (!point.id || point.id.trim() === '') {
                    continue;
                }

                // キャンバス座標から画像座標に変換
                const imageCoords = CoordinateUtils.canvasToImage(
                    point.x, point.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );

                const result = await window.firestoreManager.addPoint(projectId, {
                    id: point.id,
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: point.index || 0,
                    isMarker: false
                });

                if (result.status === 'success') {
                    savedPoints++;
                }
            }

            // ルートを保存（キャンバス座標→画像座標に変換）
            const startEndPoints = this.routeManager.getStartEndPoints();
            const routePoints = this.routeManager.getRoutePoints();
            if (startEndPoints.start && startEndPoints.end && routePoints.length > 0) {
                // 中間点の座標を画像座標に変換
                const waypointsInImageCoords = routePoints.map(waypoint => {
                    const imageCoords = CoordinateUtils.canvasToImage(
                        waypoint.x, waypoint.y,
                        this.canvas.width, this.canvas.height,
                        this.currentImage.width, this.currentImage.height
                    );
                    return { x: imageCoords.x, y: imageCoords.y };
                });

                const result = await window.firestoreManager.addRoute(projectId, {
                    routeName: `${startEndPoints.start} → ${startEndPoints.end}`,
                    startPoint: startEndPoints.start,
                    endPoint: startEndPoints.end,
                    waypoints: waypointsInImageCoords,
                    description: ''
                });

                if (result.status === 'success') {
                    savedRoutes++;
                }
            }

            // スポットを保存（キャンバス座標→画像座標に変換）
            const spots = this.spotManager.getSpots();
            for (const spot of spots) {
                // 空白名のスポットはスキップ
                if (!spot.name || spot.name.trim() === '') {
                    continue;
                }

                // キャンバス座標から画像座標に変換
                const imageCoords = CoordinateUtils.canvasToImage(
                    spot.x, spot.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );

                const result = await window.firestoreManager.addSpot(projectId, {
                    name: spot.name,
                    x: imageCoords.x,
                    y: imageCoords.y,
                    index: spot.index || 0,
                    description: '',
                    category: ''
                });

                if (result.status === 'success') {
                    savedSpots++;
                }
            }

            // 結果メッセージ
            UIHelper.showMessage(
                `保存完了: ポイント${savedPoints}件、ルート${savedRoutes}件、スポット${savedSpots}件`
            );

        } catch (error) {
            console.error('Firebase保存エラー:', error);
            UIHelper.showError('保存中にエラーが発生しました: ' + error.message);
        }
    }

    /**
     * Firebaseからデータを読み込み
     */
    async loadFromFirebase() {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            UIHelper.showError('Firebase接続が利用できません');
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            UIHelper.showError('先に画像を読み込んでください');
            return;
        }

        try {
            // プロジェクトIDを画像ファイル名から取得
            const projectId = this.fileHandler.getCurrentImageFileName();
            if (!projectId) {
                UIHelper.showError('画像ファイル名を取得できません');
                return;
            }

            // プロジェクトの存在確認
            const projectMetadata = await window.firestoreManager.getProjectMetadata(projectId);
            if (!projectMetadata) {
                UIHelper.showError(`プロジェクト「${projectId}」のデータが見つかりません`);
                return;
            }

            // 既存データをクリア
            if (this.pointManager.getPoints().length > 0 ||
                this.routeManager.getRoutePoints().length > 0 ||
                this.spotManager.getSpots().length > 0) {
                const confirmed = confirm('現在のデータを削除して読み込みますか？');
                if (!confirmed) {
                    return;
                }
            }

            this.pointManager.clearPoints();
            this.routeManager.clearAllRoutes();
            this.spotManager.clearSpots();

            // ポイントを読み込み（画像座標→キャンバス座標に変換）
            const points = await window.firestoreManager.getPoints(projectId);
            let loadedPoints = 0;
            for (const point of points) {
                // 空白IDはスキップ
                if (!point.id || point.id.trim() === '') {
                    continue;
                }

                // 画像座標からキャンバス座標に変換
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    point.x, point.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );

                this.pointManager.addPoint(canvasCoords.x, canvasCoords.y, point.id);
                loadedPoints++;
            }

            // ルートを読み込み（画像座標→キャンバス座標に変換）
            const routes = await window.firestoreManager.getRoutes(projectId);
            let loadedRoutes = 0;
            for (const route of routes) {
                // 中間点の座標変換
                const convertedWaypoints = [];
                for (const waypoint of route.waypoints) {
                    // 画像座標からキャンバス座標に変換
                    const canvasCoords = CoordinateUtils.imageToCanvas(
                        waypoint.x, waypoint.y,
                        this.canvas.width, this.canvas.height,
                        this.currentImage.width, this.currentImage.height
                    );
                    convertedWaypoints.push({ x: canvasCoords.x, y: canvasCoords.y });
                }

                // ルートオブジェクトを作成してRouteManagerに追加
                this.routeManager.addRoute({
                    routeName: route.routeName || `${route.startPoint} → ${route.endPoint}`,
                    startPointId: route.startPoint,
                    endPointId: route.endPoint,
                    routePoints: convertedWaypoints
                });
                loadedRoutes++;
            }

            // スポットを読み込み（画像座標→キャンバス座標に変換）
            const spots = await window.firestoreManager.getSpots(projectId);
            let loadedSpots = 0;
            for (const spot of spots) {
                // 空白名はスキップ
                if (!spot.name || spot.name.trim() === '') {
                    continue;
                }

                // 画像座標からキャンバス座標に変換
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    spot.x, spot.y,
                    this.canvas.width, this.canvas.height,
                    this.currentImage.width, this.currentImage.height
                );

                this.spotManager.addSpot(canvasCoords.x, canvasCoords.y, spot.name);
                loadedSpots++;
            }

            // UIを更新
            this.inputManager.redrawInputBoxes(this.pointManager.getPoints());
            this.inputManager.redrawSpotInputBoxes(this.spotManager.getSpots());
            this.updatePopupPositions();
            this.redrawCanvas();

            // ポイント数・スポット数を更新
            document.getElementById('pointCount').textContent = loadedPoints;
            document.getElementById('spotCount').textContent = loadedSpots;

            // 中間点数は選択されたルートのものを表示（初期状態は0）
            document.getElementById('waypointCount').textContent = 0;

            UIHelper.showMessage(
                `読み込み完了: ポイント${loadedPoints}件、ルート${loadedRoutes}件、スポット${loadedSpots}件`
            );

        } catch (error) {
            console.error('Firebase読み込みエラー:', error);
            UIHelper.showError('読み込み中にエラーが発生しました: ' + error.message);
        }
    }

}