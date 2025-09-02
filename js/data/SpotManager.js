/**
 * スポット管理クラス
 * 一時的な注目点（スポット）の管理を行う
 */
export class SpotManager {
    constructor() {
        this.spots = [];
        this.callbacks = {};
    }

    /**
     * コールバックを設定
     * @param {string} event - イベント名
     * @param {Function} callback - コールバック関数
     */
    setCallback(event, callback) {
        this.callbacks[event] = callback;
    }

    /**
     * コールバックを実行
     * @param {string} event - イベント名
     * @param {*} data - コールバックに渡すデータ
     */
    notify(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    /**
     * スポットを追加
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Object} 追加されたスポット
     */
    addSpot(x, y) {
        const spot = {
            x: Math.round(x),
            y: Math.round(y),
            index: this.spots.length
        };
        
        this.spots.push(spot);
        this.notify('onChange');
        this.notify('onCountChange', this.spots.length);
        
        return spot;
    }

    /**
     * スポットを削除
     * @param {number} index - スポットのインデックス
     */
    removeSpot(index) {
        if (index >= 0 && index < this.spots.length) {
            this.spots.splice(index, 1);
            // インデックスを再割り当て
            this.spots.forEach((spot, i) => {
                spot.index = i;
            });
            
            this.notify('onChange');
            this.notify('onCountChange', this.spots.length);
        }
    }

    /**
     * 全スポットをクリア
     */
    clearSpots() {
        this.spots = [];
        this.notify('onChange');
        this.notify('onCountChange', 0);
    }

    /**
     * スポットリストを取得
     * @returns {Array} スポットの配列
     */
    getSpots() {
        return this.spots;
    }

    /**
     * スポット数を取得
     * @returns {number} スポット数
     */
    getSpotCount() {
        return this.spots.length;
    }

    /**
     * 指定した座標にスポットが存在するかチェック
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @param {number} tolerance - 許容誤差（デフォルト8px）
     * @returns {number} スポットのインデックス、存在しない場合は-1
     */
    findSpotAt(x, y, tolerance = 8) {
        for (let i = 0; i < this.spots.length; i++) {
            const spot = this.spots[i];
            const dx = x - spot.x;
            const dy = y - spot.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= tolerance) {
                return i;
            }
        }
        return -1;
    }

    /**
     * スポットの位置を更新
     * @param {number} index - スポットのインデックス
     * @param {number} x - 新しいX座標
     * @param {number} y - 新しいY座標
     */
    updateSpotPosition(index, x, y) {
        if (index >= 0 && index < this.spots.length) {
            this.spots[index].x = Math.round(x);
            this.spots[index].y = Math.round(y);
            this.notify('onChange');
        }
    }
}