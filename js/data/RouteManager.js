import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * ルートデータの管理を行うクラス
 */
export class RouteManager {
    constructor() {
        this.routePoints = [];
        this.startPointId = '';
        this.endPointId = '';
        this.callbacks = {
            onChange: null,
            onCountChange: null,
            onStartEndChange: null
        };
    }

    /**
     * コールバック関数を設定
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    setCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * 変更通知を発行
     * @param {string} event - イベント名
     * @param {any} data - イベントデータ
     */
    notify(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    /**
     * ルート中間点を追加
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Object} 追加されたポイント
     */
    addRoutePoint(x, y) {
        const point = { 
            x: Math.round(x), 
            y: Math.round(y)
        };
        
        this.routePoints.push(point);
        this.notify('onChange', this.routePoints);
        this.notify('onCountChange', this.routePoints.length);
        return point;
    }

    /**
     * ルート情報を全てクリア
     */
    clearRoute() {
        this.routePoints = [];
        this.startPointId = '';
        this.endPointId = '';
        this.notify('onChange', this.routePoints);
        this.notify('onCountChange', 0);
        this.notify('onStartEndChange', { start: '', end: '' });
    }

    /**
     * 開始ポイントIDを設定
     * @param {string} id - 開始ポイントID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     * @example
     * // 入力時（フォーマット処理なし）
     * routeManager.setStartPoint('J-1', true);  // → 'J-1'
     * 
     * // blur時（フォーマット処理あり）
     * routeManager.setStartPoint('J-1');  // → 'J-01'
     */
    setStartPoint(id, skipFormatting = false) {
        this.startPointId = skipFormatting ? id : Validators.formatPointId(id);
        this.notify('onStartEndChange', { 
            start: this.startPointId, 
            end: this.endPointId 
        });
    }

    /**
     * 終了ポイントIDを設定
     * @param {string} id - 終了ポイントID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     * @example
     * // 入力時（フォーマット処理なし）
     * routeManager.setEndPoint('A-2', true);  // → 'A-2'
     * 
     * // blur時（フォーマット処理あり）
     * routeManager.setEndPoint('A-2');  // → 'A-02'
     */
    setEndPoint(id, skipFormatting = false) {
        this.endPointId = skipFormatting ? id : Validators.formatPointId(id);
        this.notify('onStartEndChange', { 
            start: this.startPointId, 
            end: this.endPointId 
        });
    }

    /**
     * ルートポイント配列を取得
     * @returns {Array} ルートポイント配列
     */
    getRoutePoints() {
        return this.routePoints;
    }

    /**
     * 開始・終了ポイントIDを取得
     * @returns {{start: string, end: string}} 開始・終了ポイントID
     */
    getStartEndPoints() {
        return {
            start: this.startPointId,
            end: this.endPointId
        };
    }

    /**
     * 開始・終了ポイントの検証
     * @param {Array} registeredIds - 登録済みポイントID配列
     * @returns {{isValid: boolean, message?: string}} 検証結果
     */
    validateStartEndPoints(registeredIds) {
        if (this.startPointId && !registeredIds.includes(this.startPointId)) {
            return {
                isValid: false,
                message: `開始ポイント "${this.startPointId}" がポイントとして登録されていません。先にポイント編集モードでポイントを登録してください。`
            };
        }
        
        if (this.endPointId && !registeredIds.includes(this.endPointId)) {
            return {
                isValid: false,
                message: `終了ポイント "${this.endPointId}" がポイントとして登録されていません。先にポイント編集モードでポイントを登録してください。`
            };
        }
        
        if (!this.startPointId || !this.endPointId) {
            return {
                isValid: false,
                message: '開始ポイントと終了ポイントの両方を設定してください。'
            };
        }
        
        return { isValid: true };
    }

    /**
     * ルート用のデフォルトファイル名を生成
     * @param {string} imageFileName - 画像ファイル名
     * @returns {string} ルートファイル名
     */
    generateRouteFilename(imageFileName) {
        const baseFileName = imageFileName || 'route';
        const startPoint = this.startPointId || 'start';
        const endPoint = this.endPointId || 'end';
        return `${baseFileName}_route_${startPoint}_to_${endPoint}.json`;
    }

    /**
     * JSONデータからルートを復元
     * @param {Object} data - JSONデータ
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     */
    loadFromJSON(data, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        if (!Validators.isValidRouteData(data)) {
            throw new Error('ルートJSONファイルの形式が正しくありません');
        }

        this.routePoints = [];
        this.startPointId = data.routeInfo.startPoint || '';
        this.endPointId = data.routeInfo.endPoint || '';
        
        data.points.forEach(pointData => {
            if (pointData.type === 'waypoint' && 
                pointData.imageX !== undefined && 
                pointData.imageY !== undefined) {
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    pointData.imageX, pointData.imageY,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                this.routePoints.push({
                    x: canvasCoords.x,
                    y: canvasCoords.y
                });
            }
        });
        
        this.notify('onChange', this.routePoints);
        this.notify('onCountChange', this.routePoints.length);
        this.notify('onStartEndChange', { 
            start: this.startPointId, 
            end: this.endPointId 
        });
    }

    /**
     * ルートデータをJSON形式で出力
     * @param {string} imageFileName - 画像ファイル名
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @returns {Object} JSONデータ
     */
    exportToJSON(imageFileName, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        return {
            routeInfo: {
                startPoint: this.startPointId || '',
                endPoint: this.endPointId || '',
                waypointCount: this.routePoints.length
            },
            imageReference: imageFileName,
            imageInfo: {
                width: imageWidth,
                height: imageHeight
            },
            points: this.routePoints.map((point, index) => {
                const imageCoords = CoordinateUtils.canvasToImage(
                    point.x, point.y,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                return {
                    type: 'waypoint',
                    index: index + 1,
                    imageX: imageCoords.x,
                    imageY: imageCoords.y
                };
            }),
            exportedAt: new Date().toISOString()
        };
    }
}