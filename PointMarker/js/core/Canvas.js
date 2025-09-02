/**
 * キャンバス描画を管理するクラス
 */
export class CanvasRenderer {
    /**
     * コンストラクタ
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.currentImage = null;
    }

    /**
     * 現在の画像を設定
     * @param {HTMLImageElement} image - 設定する画像
     */
    setImage(image) {
        this.currentImage = image;
    }

    /**
     * キャンバスをクリアして画像を描画
     */
    drawImage() {
        if (!this.currentImage) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.currentImage, 0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 単一ポイントを指定色・サイズで描画
     * @param {Object} point - ポイントオブジェクト {x, y}
     * @param {string} color - 描画色 (デフォルト: '#ff0000')
     * @param {number} radius - 半径 (デフォルト: 4)
     * @param {number} strokeWidth - 線の太さ (デフォルト: 1.5)
     */
    drawPoint(point, color = '#ff0000', radius = 4, strokeWidth = 1.5) {
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = strokeWidth;
        
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
    }

    /**
     * 複数のポイントを一括描画
     * @param {Array} points - ポイント配列
     * @param {Object} options - 描画オプション
     */
    drawPoints(points, options = {}) {
        const {
            defaultColor = '#ff0000',
            highlightColor = '#0066ff',
            markerColor = '#0066ff',
            startPointId = '',
            endPointId = '',
            showRouteMode = false
        } = options;

        points.forEach((point) => {
            let color = defaultColor;
            let radius = 4;
            let strokeWidth = 1.5;
            
            if ((showRouteMode || startPointId || endPointId) && 
                (point.id === startPointId || point.id === endPointId)) {
                color = highlightColor;
            } else if (point.isMarker) {
                color = markerColor;
                radius = 3;
                strokeWidth = 1;
            }
            
            this.drawPoint(point, color, radius, strokeWidth);
        });
    }

    /**
     * ルートポイント（中間点）を描画
     * @param {Array} routePoints - ルートポイント配列
     */
    drawRoutePoints(routePoints) {
        routePoints.forEach(point => {
            this.drawPoint(point, '#0066ff', 3, 1);
        });
    }

    /**
     * 画像とすべてのポイントを再描画
     * @param {Array} points - 通常ポイント配列
     * @param {Array} routePoints - ルートポイント配列
     * @param {Object} options - 描画オプション
     */
    redraw(points = [], routePoints = [], options = {}) {
        this.drawImage();
        this.drawPoints(points, options);
        this.drawRoutePoints(routePoints);
    }

    /**
     * キャンバスサイズを画像に応じて設定
     * @param {string} layout - レイアウトモード ('sidebar' | 'overlay')
     */
    setupCanvas(layout = 'sidebar') {
        if (!this.currentImage) return;
        
        const container = this.canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        
        let availableWidth, availableHeight;
        
        if (layout === 'sidebar') {
            availableWidth = containerRect.width - 40;
            availableHeight = window.innerHeight - 140;
        } else {
            availableWidth = window.innerWidth - 40;
            availableHeight = window.innerHeight - 140;
        }
        
        const imageAspectRatio = this.currentImage.height / this.currentImage.width;
        
        let canvasWidth = availableWidth;
        let canvasHeight = canvasWidth * imageAspectRatio;
        
        if (canvasHeight > availableHeight) {
            canvasHeight = availableHeight;
            canvasWidth = canvasHeight / imageAspectRatio;
        }
        
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
        this.canvas.style.display = 'block';
        this.canvas.style.visibility = 'visible';
    }
}