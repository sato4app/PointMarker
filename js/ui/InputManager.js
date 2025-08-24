import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * 動的入力フィールドの管理を行うクラス
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.inputElements = [];
        this.isRouteEditMode = false;
        this.callbacks = {
            onPointIdChange: null,
            onPointRemove: null
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
     * ルート編集モードを設定
     * @param {boolean} isRouteEditMode - ルート編集モードかどうか
     */
    setRouteEditMode(isRouteEditMode) {
        this.isRouteEditMode = isRouteEditMode;
        this.updateInputsState();
    }

    /**
     * 入力状態を更新
     */
    updateInputsState() {
        this.inputElements.forEach(input => {
            if (this.isRouteEditMode) {
                input.disabled = true;
                input.style.backgroundColor = '#e0e0e0';
                input.title = 'ルート編集モード中はポイントID名の編集はできません';
            } else {
                input.disabled = false;
                input.style.backgroundColor = '';
                input.title = '';
            }
        });
    }

    /**
     * ポイント用の入力ボックスを作成
     * @param {Object} point - ポイントオブジェクト
     * @param {number} index - ポイントのインデックス
     * @param {boolean} shouldFocus - フォーカスするかどうか
     */
    createInputBox(point, index, shouldFocus = false) {
        if (point.isMarker) {
            return;
        }
        
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 4;
        input.className = 'point-id-input';
        input.placeholder = 'ID';
        input.style.position = 'absolute';
        input.style.zIndex = '1000';
        input.value = point.id || '';
        
        this.positionInputBox(input, point);
        
        // input時は変換処理を一切行わない
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            
            // 入力中は変換処理なし、そのまま保存
            this.notify('onPointIdChange', { index, id: value, skipFormatting: true });
        });
        
        // blur時は単純に値を保存するのみ（フォーマット処理なし）
        input.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            
            // フォーマット処理なしで更新
            this.notify('onPointIdChange', { index, id: value, skipFormatting: true });
        });
        
        // キーボードイベント（Escapeキーでポイント削除）
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.notify('onPointRemove', { index, point });
            }
        });
        
        // ポイントインデックスを属性として設定
        input.setAttribute('data-point-index', index);
        
        document.body.appendChild(input);
        this.inputElements.push(input);

        // ルート編集モードの状態を適用
        if (this.isRouteEditMode) {
            input.disabled = true;
            input.style.backgroundColor = '#e0e0e0';
            input.title = 'ルート編集モード中はポイントID名の編集はできません';
        }

        if (shouldFocus && (point.id ?? '') === '') {
            setTimeout(() => input.focus(), 0);
        }
    }

    /**
     * 入力ボックスの最適な表示位置を計算・設定
     * @param {HTMLInputElement} input - 入力要素
     * @param {Object} point - ポイントオブジェクト
     */
    positionInputBox(input, point) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;
        
        const inputX = this.findOptimalInputPosition(point.x, point.y, scaleX, rect.left);
        const inputY = point.y * scaleY + rect.top - 15;
        
        input.style.left = inputX + 'px';
        input.style.top = inputY + 'px';
    }

    /**
     * 画面端を考慮した入力ボックスの横位置計算
     * @param {number} pointX - ポイントX座標
     * @param {number} pointY - ポイントY座標
     * @param {number} scaleX - X方向スケール
     * @param {number} canvasLeft - キャンバス左端位置
     * @returns {number} 最適な横位置
     */
    findOptimalInputPosition(pointX, pointY, scaleX, canvasLeft) {
        const inputWidth = 50;
        const margin = 10;
        const scaledPointX = pointX * scaleX + canvasLeft;
        
        const rightPos = scaledPointX + margin;
        const leftPos = scaledPointX - inputWidth - margin;
        
        if (rightPos + inputWidth < window.innerWidth - 20) {
            return rightPos;
        } else {
            return Math.max(leftPos, canvasLeft + 5);
        }
    }

    /**
     * 特定のポイントのIDのみを更新（入力ボックスは再作成しない）
     * @param {number} pointIndex - 更新するポイントのインデックス
     * @param {string} newId - 新しいID
     */
    updatePointIdDisplay(pointIndex, newId) {
        const input = this.inputElements.find((element) => {
            // 入力要素に紐づくポイントのインデックスを確認
            return element.getAttribute('data-point-index') == pointIndex;
        });
        if (input && input.value !== newId) {
            input.value = newId;
        }
    }

    /**
     * 全入力ボックスをクリア・再作成
     * @param {Array} points - ポイント配列
     */
    redrawInputBoxes(points) {
        this.clearInputBoxes();
        
        setTimeout(() => {
            points.forEach((point, index) => {
                if (!point.isMarker) {
                    this.createInputBox(point, index);
                    const input = this.inputElements[this.inputElements.length - 1];
                    if (input) {
                        input.value = point.id || '';
                        input.setAttribute('data-point-index', index);
                    }
                }
            });
        }, 10);
    }

    /**
     * 全ての動的入力ボックスをDOMから削除
     */
    clearInputBoxes() {
        this.inputElements.forEach(input => {
            if (input && input.parentNode) {
                input.parentNode.removeChild(input);
            }
        });
        this.inputElements = [];
    }
}