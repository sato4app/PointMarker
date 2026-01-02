import { BaseManager } from '../core/BaseManager.js';

/**
 * エリアデータの管理を行うクラス（複数エリア対応）
 */
export class AreaManager extends BaseManager {
    constructor() {
        super();
        // 複数エリアを管理
        this.areas = [];
        // 現在選択されているエリアのインデックス（-1 = 未選択）
        this.selectedAreaIndex = -1;
    }

    /**
     * 全エリアを取得
     * @returns {Array} 全エリアの配列
     */
    getAllAreas() {
        return this.areas;
    }

    /**
     * 選択中のエリアを取得
     * @returns {Object|null} 選択中のエリア、または null
     */
    getSelectedArea() {
        if (this.selectedAreaIndex >= 0 && this.selectedAreaIndex < this.areas.length) {
            return this.areas[this.selectedAreaIndex];
        }
        return null;
    }

    /**
     * エリアを選択
     * @param {number} index - エリアのインデックス（-1 = 未選択）
     */
    selectArea(index) {
        this.selectedAreaIndex = index;
        this.notify('onSelectionChange', index);

        // 選択されたエリアの情報を通知
        if (index >= 0 && index < this.areas.length) {
            const area = this.areas[index];
            this.notify('onAreaInfoChange', {
                name: area.areaName
            });
            this.notify('onCountChange', area.vertices ? area.vertices.length : 0);
        } else {
            // 未選択の場合はクリア
            this.notify('onAreaInfoChange', { name: '' });
            this.notify('onCountChange', 0);
        }
        this.notify('onChange');
    }

    /**
     * エリアを追加
     * @param {Object} area - エリアデータ {areaName, vertices}
     */
    addArea(area) {
        // isModifiedフラグを初期化（デフォルト: false）
        if (area.isModified === undefined) {
            area.isModified = false;
        }
        if (!area.vertices) {
            area.vertices = [];
        }
        if (!area.areaName) {
            area.areaName = `エリア ${this.areas.length + 1}`;
        }
        this.areas.push(area);
        this.notify('onAreaListChange', this.areas);
    }

    /**
     * エリアを削除
     * @param {number} index - 削除するエリアのインデックス
     */
    deleteArea(index) {
        if (index < 0 || index >= this.areas.length) {
            console.warn('Invalid area index:', index);
            return;
        }

        this.areas.splice(index, 1);

        // 削除したエリアが選択中だった場合、選択を解除
        if (this.selectedAreaIndex === index) {
            this.selectedAreaIndex = -1;
            this.notify('onAreaInfoChange', { name: '' });
            this.notify('onCountChange', 0);
            this.notify('onSelectionChange', -1);
        } else if (this.selectedAreaIndex > index) {
            // 削除したエリアより後ろのエリアが選択されていた場合、インデックスを調整
            this.selectedAreaIndex--;
            this.notify('onSelectionChange', this.selectedAreaIndex);
        }

        this.notify('onAreaListChange', this.areas);
        this.notify('onChange');
    }

    /**
     * 頂点を追加（選択中のエリアにのみ追加）
     * @param {number} x - X座標
     * @param {number} y - Y座標
     * @returns {Object} 追加されたポイント
     */
    addVertex(x, y) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) {
            console.warn('No area selected. Cannot add vertex.');
            this.notify('onNoAreaSelected', 'エリアを選択してから頂点を追加してください');
            return null;
        }

        const point = {
            x: Math.round(x),
            y: Math.round(y)
        };

        if (!selectedArea.vertices) {
            selectedArea.vertices = [];
        }
        selectedArea.vertices.push(point);

        // 頂点の順序を再定義（面積最大化/シンプルポリゴン化）
        this.reorderVertices(this.selectedAreaIndex);

        this.notify('onChange');
        this.notify('onCountChange', selectedArea.vertices.length);

        // 更新状態をチェック
        this.checkAndUpdateModifiedState();

        return point;
    }

    /**
     * 指定位置に最も近い頂点を検索（選択中のエリアのみ）
     * @param {number} x - X座標（キャンバス座標）
     * @param {number} y - Y座標（キャンバス座標）
     * @param {number} threshold - 判定閾値（デフォルト: 10px）
     * @returns {{index: number, point: Object} | null} 見つかった頂点と配列インデックス、見つからない場合はnull
     */
    findVertexAt(x, y, threshold = 10) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return null;
        }

        for (let i = 0; i < selectedArea.vertices.length; i++) {
            const point = selectedArea.vertices[i];
            const dx = point.x - x;
            const dy = point.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= threshold) {
                return { index: i, point: point };
            }
        }
        return null;
    }

    /**
     * 指定インデックスの頂点を取得（選択中のエリアのみ）
     * @param {number} index - 頂点の配列インデックス
     * @returns {Object|null} 頂点データ、またはnull
     */
    getAreaVertex(index) {
        const selectedArea = this.getSelectedArea();
        if (selectedArea && selectedArea.vertices && index >= 0 && index < selectedArea.vertices.length) {
            return selectedArea.vertices[index];
        }
        return null;
    }

    /**
     * 頂点の座標を更新（選択中のエリアのみ）
     * @param {number} index - 頂点の配列インデックス
     * @param {number} x - 新しいX座標
     * @param {number} y - 新しいY座標
     */
    updateVertex(index, x, y) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return;
        }

        if (index >= 0 && index < selectedArea.vertices.length) {
            selectedArea.vertices[index].x = Math.round(x);
            selectedArea.vertices[index].y = Math.round(y);
            this.notify('onChange');

            // 更新状態をチェック
            this.checkAndUpdateModifiedState();
        }
    }

    /**
     * 頂点を削除（選択中のエリアのみ）
     * @param {number} index - 削除する頂点の配列インデックス
     * @returns {boolean} 削除成功したかどうか
     */
    removeVertex(index) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return false;
        }

        if (index >= 0 && index < selectedArea.vertices.length) {
            selectedArea.vertices.splice(index, 1);

            // 頂点の順序を再定義
            this.reorderVertices(this.selectedAreaIndex);

            this.notify('onChange');
            this.notify('onCountChange', selectedArea.vertices.length);

            // 更新状態をチェック
            this.checkAndUpdateModifiedState();
            return true;
        }
        return false;
    }

    /**
     * 頂点を一括削除（選択中のエリアのみ）
     * @param {Array<number>} indices - 削除する頂点のインデックス配列
     */
    removeVertices(indices) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea || !selectedArea.vertices) {
            return 0;
        }

        let deletedCount = 0;
        const sortedIndices = [...indices].sort((a, b) => b - a);

        for (const index of sortedIndices) {
            if (index >= 0 && index < selectedArea.vertices.length) {
                selectedArea.vertices.splice(index, 1);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            // 頂点の順序を再定義
            this.reorderVertices(this.selectedAreaIndex);

            this.notify('onChange');
            this.notify('onCountChange', selectedArea.vertices.length);
            this.checkAndUpdateModifiedState();
        }

        return deletedCount;
    }

    /**
     * 頂点の順序を面積が最大になるように（重心周りの角度順に）再定義
     * @param {number} areaIndex - 対象エリアのインデックス
     */
    reorderVertices(areaIndex) {
        if (areaIndex < 0 || areaIndex >= this.areas.length) return;

        const area = this.areas[areaIndex];
        if (!area.vertices || area.vertices.length < 3) return;

        // 重心を計算
        let cx = 0, cy = 0;
        area.vertices.forEach(v => {
            cx += v.x;
            cy += v.y;
        });
        cx /= area.vertices.length;
        cy /= area.vertices.length;

        // 重心からの角度でソート
        area.vertices.sort((a, b) => {
            const angleA = Math.atan2(a.y - cy, a.x - cx);
            const angleB = Math.atan2(b.y - cy, b.x - cx);
            return angleA - angleB;
        });
    }

    /**
     * エリア名を設定（選択中のエリアのみ）
     * @param {string} name - エリア名
     */
    setAreaName(name) {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) {
            console.warn('No area selected. Cannot set area name.');
            return;
        }

        selectedArea.areaName = name;
        this.notify('onAreaListChange', this.areas);
        this.checkAndUpdateModifiedState();
    }

    /**
     * 更新状態をチェックして必要に応じてフラグを設定
     */
    checkAndUpdateModifiedState() {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) return;

        const hasName = selectedArea.areaName && selectedArea.areaName.trim().length > 0;
        const hasVertices = selectedArea.vertices && selectedArea.vertices.length >= 3;

        if (hasName && hasVertices) {
            if (!selectedArea.isModified) {
                selectedArea.isModified = true;
                this.notify('onModifiedStateChange', { isModified: true, areaIndex: this.selectedAreaIndex });
                this.notify('onAreaListChange', this.areas);
            }
        }
    }

    /**
     * 全エリアを削除
     */
    clearAreas() {
        this.areas = [];
        this.selectedAreaIndex = -1;
        this.notify('onAreaListChange', this.areas);
        this.notify('onChange');
        this.notify('onSelectionChange', -1);
        this.notify('onAreaInfoChange', { name: '' });
        this.notify('onCountChange', 0);
    }

    /**
     * エリア情報を検証
     */
    validateArea() {
        const selectedArea = this.getSelectedArea();
        if (!selectedArea) {
            return { isValid: false, message: 'エリアが選択されていません。' };
        }

        if (!selectedArea.areaName || selectedArea.areaName.trim() === '') {
            return { isValid: false, message: 'エリア名を入力してください。' };
        }

        if (!selectedArea.vertices || selectedArea.vertices.length < 3) {
            return { isValid: false, message: 'エリアを作成するには少なくとも3つの頂点が必要です。' };
        }

        return { isValid: true };
    }
}
