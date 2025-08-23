import { CoordinateUtils } from '../utils/Coordinates.js';
import { Validators } from '../utils/Validators.js';

/**
 * 動的入力フィールドの管理を行うクラス
 */
export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.inputElements = [];
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
        
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            const uppercaseValue = value.replace(/[a-z]/g, (match) => match.toUpperCase());
            
            if (uppercaseValue !== value) {
                e.target.value = uppercaseValue;
            }
            
            this.notify('onPointIdChange', { index, id: uppercaseValue });
        });
        
        input.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            
            if (value === '') {
                this.notify('onPointRemove', { index, point });
                return;
            }
            
            const formattedValue = Validators.formatPointId(value);
            
            if (formattedValue !== value) {
                e.target.value = formattedValue;
            }
            
            if (Validators.isValidPointIdFormat(formattedValue)) {
                e.target.style.backgroundColor = '';
            } else {
                e.target.style.backgroundColor = '#ffe4e4';
            }
            
            this.notify('onPointIdChange', { index, id: formattedValue });
        });
        
        document.body.appendChild(input);
        this.inputElements.push(input);

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