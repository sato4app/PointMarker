import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * ポイントデータの管理を行うクラス
 */
export class PointManager {
    constructor() {
        this.points = [];
        this.callbacks = {
            onChange: null,
            onCountChange: null
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
     * ポイントを追加
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {string} id - ポイントID
     * @param {boolean} isMarker - マーカーポイントかどうか
     * @returns {Object} 追加されたポイント
     */
    addPoint(x, y, id = '', isMarker = false) {
        const point = { 
            x: Math.round(x), 
            y: Math.round(y),
            id,
            isMarker
        };
        
        this.points.push(point);
        this.notify('onChange', this.points);
        this.notify('onCountChange', this.getUserPointCount());
        return point;
    }

    /**
     * 指定インデックスのポイントを削除
     * @param {number} index - 削除するポイントのインデックス
     */
    removePoint(index) {
        if (index >= 0 && index < this.points.length) {
            this.points.splice(index, 1);
            this.notify('onChange', this.points);
            this.notify('onCountChange', this.getUserPointCount());
        }
    }

    /**
     * ポイントIDを更新
     * @param {number} index - 更新するポイントのインデックス
     * @param {string} newId - 新しいID
     * @param {boolean} skipFormatting - フォーマット処理をスキップするかどうか (デフォルト: false)
     * @example
     * // 入力時（フォーマット処理なし）
     * pointManager.updatePointId(0, 'J-1', true);  // → 'J-1'
     * 
     * // blur時（フォーマット処理あり）
     * pointManager.updatePointId(0, 'J-1');  // → 'J-01'
     */
    updatePointId(index, newId, skipFormatting = false) {
        if (index >= 0 && index < this.points.length) {
            this.points[index].id = skipFormatting ? newId : Validators.formatPointId(newId);
            this.notify('onChange', this.points);
        }
    }

    /**
     * すべてのポイントをクリア
     */
    clearPoints() {
        this.points = [];
        this.notify('onChange', this.points);
        this.notify('onCountChange', 0);
    }

    /**
     * すべてのポイントID名を補正
     */
    formatAllPointIds() {
        this.points.forEach(point => {
            if (point.id) {
                point.id = Validators.formatPointId(point.id);
            }
        });
        this.notify('onChange', this.points);
    }

    /**
     * ポイント配列を取得
     * @returns {Array} ポイント配列
     */
    getPoints() {
        return this.points;
    }

    /**
     * ユーザーポイント数を取得（マーカー除外）
     * @returns {number} ユーザーポイント数
     */
    getUserPointCount() {
        return this.points.filter(point => !point.isMarker).length;
    }

    /**
     * 指定IDのポイントを検索
     * @param {string} id - 検索するポイントID
     * @returns {Object|null} 見つかったポイント、またはnull
     */
    findPointById(id) {
        return this.points.find(point => point.id === id) || null;
    }

    /**
     * 登録されている全ポイントIDを取得
     * @returns {Array} ポイントID配列
     */
    getRegisteredIds() {
        return this.points
            .map(point => point.id)
            .filter(id => id.trim() !== '');
    }

    /**
     * 末尾の未入力ユーザーポイントを削除
     */
    removeTrailingEmptyUserPoints() {
        if (this.points.length === 0) return;
        
        let removed = false;
        for (let i = this.points.length - 1; i >= 0; i--) {
            const point = this.points[i];
            if (point.isMarker) {
                continue;
            }
            if ((point.id ?? '') === '') {
                this.points.splice(i, 1);
                removed = true;
            } else {
                break;
            }
        }
        
        if (removed) {
            this.notify('onChange', this.points);
            this.notify('onCountChange', this.getUserPointCount());
        }
    }

    /**
     * JSONデータからポイントを復元
     * @param {Object} data - JSONデータ
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     */
    loadFromJSON(data, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        if (!Validators.isValidPointData(data)) {
            throw new Error('JSONファイルにポイントデータが見つかりません');
        }

        this.points = [];
        
        data.points.forEach(pointData => {
            if (pointData.imageX !== undefined && pointData.imageY !== undefined) {
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    pointData.imageX, pointData.imageY,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                this.addPoint(
                    canvasCoords.x, canvasCoords.y,
                    pointData.id || '',
                    pointData.isMarker || false
                );
            }
        });
        
        this.notify('onChange', this.points);
        this.notify('onCountChange', this.getUserPointCount());
    }

    /**
     * ポイントデータをJSON形式で出力
     * @param {string} imageFileName - 画像ファイル名
     * @param {number} canvasWidth - キャンバス幅
     * @param {number} canvasHeight - キャンバス高さ
     * @param {number} imageWidth - 元画像幅
     * @param {number} imageHeight - 元画像高さ
     * @returns {Object} JSONデータ
     */
    exportToJSON(imageFileName, canvasWidth, canvasHeight, imageWidth, imageHeight) {
        return {
            totalPoints: this.points.length,
            imageReference: imageFileName,
            imageInfo: {
                width: imageWidth,
                height: imageHeight
            },
            points: this.points.map((point, index) => {
                const imageCoords = CoordinateUtils.canvasToImage(
                    point.x, point.y,
                    canvasWidth, canvasHeight,
                    imageWidth, imageHeight
                );
                
                return {
                    index: index + 1,
                    id: point.id || '',
                    imageX: imageCoords.x,
                    imageY: imageCoords.y,
                    isMarker: point.isMarker || false
                };
            }),
            exportedAt: new Date().toISOString()
        };
    }
}