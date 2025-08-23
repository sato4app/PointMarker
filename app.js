/**
 * PickPoints - ハイキングマップポイント選択ツール
 * PNG画像からポイントを選択してJSON出力するWebアプリケーション
 */
class PickPoints {
    /**
     * アプリケーション初期化とプロパティ設定
     */
    constructor() {
        // Canvas要素とコンテキストを取得
        this.canvas = document.getElementById('mapCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // データ保存用プロパティ
        this.points = [];              // ポイント編集モードのポイント配列
        this.currentImage = null;      // 現在読み込まれている画像
        this.currentImageFileName = ''; // 現在読み込まれている画像のファイル名
        this.currentImageFileHandle = null; // 現在読み込まれている画像のファイルハンドル
        this.inputElements = [];       // 動的に生成された入力フィールド配列
        this.routePoints = [];         // ルート編集モードの中間点配列
        this.startPointId = '';        // ルートの開始ポイントID
        this.endPointId = '';          // ルートの終了ポイントID
        
        // UI状態管理プロパティ
        this.currentLayout = 'sidebar';    // レイアウト設定（sidebar/overlay）
        this.currentEditingMode = 'point'; // 編集モード（point/route）
        
        // 初期化メソッド実行
        this.initializeEventListeners();
        this.initializeLayoutManager();
    }
    
    /**
     * 全てのDOM要素にイベントリスナーを設定
     */
    initializeEventListeners() {
        // DOM要素を取得
        const imageInput = document.getElementById('imageInput');
        const imageInputLabel = document.querySelector('label[for="imageInput"]');
        const clearBtn = document.getElementById('clearBtn');
        const exportBtn = document.getElementById('exportBtn');
        const jsonInput = document.getElementById('jsonInput');
        const clearRouteBtn = document.getElementById('clearRouteBtn');
        const exportRouteBtn = document.getElementById('exportRouteBtn');
        const routeJsonInput = document.getElementById('routeJsonInput');
        const startPointInput = document.getElementById('startPointInput');
        const endPointInput = document.getElementById('endPointInput');
        
        // 画像選択のイベントリスナー（直接ファイルピッカーを呼び出し）
        imageInputLabel.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleImageSelection();
        });
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // ポイント編集用のボタンイベント
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.clearPoints();
        });
        
        // ポイントJSONエクスポートボタン（非同期処理対応）
        exportBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportJSON();
        });
        
        // JSON読み込み処理
        jsonInput.addEventListener('change', (e) => this.handleJSONLoad(e));
        
        // ルート編集用のボタンイベント
        clearRouteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.clearRoute();
        });
        
        // ルートJSONエクスポートボタン（非同期処理対応）
        exportRouteBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.exportRouteJSON();
        });
        
        routeJsonInput.addEventListener('change', (e) => this.handleRouteJSONLoad(e));
        
        // 開始・終了ポイントの入力フィールドイベント（自動大文字変換と再描画）
        startPointInput.addEventListener('input', (e) => {
            const value = e.target.value.replace(/[a-z]/g, (match) => match.toUpperCase());
            this.startPointId = value;
            e.target.value = value;
            this.drawImage();
        });
        
        endPointInput.addEventListener('input', (e) => {
            const value = e.target.value.replace(/[a-z]/g, (match) => match.toUpperCase());
            this.endPointId = value;
            e.target.value = value;
            this.drawImage();
        });
        
        // 開始ポイントのblurイベント（X-nn形式のフォーマット）
        startPointInput.addEventListener('blur', (e) => {
            const formattedValue = this.formatPointId(e.target.value);
            if (formattedValue !== e.target.value) {
                this.startPointId = formattedValue;
                e.target.value = formattedValue;
                this.drawImage();
            }
        });
        
        // 終了ポイントのblurイベント（X-nn形式のフォーマット）
        endPointInput.addEventListener('blur', (e) => {
            const formattedValue = this.formatPointId(e.target.value);
            if (formattedValue !== e.target.value) {
                this.endPointId = formattedValue;
                e.target.value = formattedValue;
                this.drawImage();
            }
        });
        
        // レイアウト選択ラジオボタンのイベント
        const layoutRadios = document.querySelectorAll('input[name=\"layout\"]');
        layoutRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.setLayout(e.target.value);
                }
            });
        });
        
        // 編集モード選択ラジオボタンのイベント
        const editingModeRadios = document.querySelectorAll('input[name=\"editingMode\"]');
        editingModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.setEditingMode(e.target.value);
                }
            });
        });
    }
    
    /**
     * 画像選択ボタンクリック時の処理（File System Access API使用）
     */
    async handleImageSelection() {
        try {
            // File System Access APIが利用可能かチェック
            if ('showOpenFilePicker' in window) {
                // ファイルピッカーを表示
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'PNG Files',
                        accept: {
                            'image/png': ['.png']
                        }
                    }],
                    multiple: false
                });
                
                // ファイルハンドルを保存
                this.currentImageFileHandle = fileHandle;
                
                // ファイルを取得
                const file = await fileHandle.getFile();
                
                // PNG形式の検証
                if (!file.type.includes('png')) {
                    alert('PNG画像ファイルを選択してください');
                    return;
                }
                
                // ファイル名を保存（拡張子を除く）
                this.currentImageFileName = file.name.replace(/\.png$/i, '');
                
                // 画像を読み込み
                await this.loadImageFromFile(file);
                
            } else {
                // フォールバック: 従来のinputファイル選択
                const imageInput = document.getElementById('imageInput');
                imageInput.click();
                
                // 一時的にchangeイベントリスナーを追加
                const handleFileSelect = async (e) => {
                    await this.handleImageLoad(e);
                    imageInput.removeEventListener('change', handleFileSelect);
                };
                imageInput.addEventListener('change', handleFileSelect);
            }
        } catch (error) {
            // ユーザーがキャンセルした場合（AbortError）は何もしない
            if (error.name === 'AbortError') {
                console.log('ファイル選択がキャンセルされました');
                return;
            }
            
            console.error('ファイル選択エラー:', error);
            alert('ファイル選択中にエラーが発生しました');
        }
    }

    /**
     * PNG画像ファイルの読み込み処理（従来のinput用）
     */
    async handleImageLoad(event) {
        // ファイル選択の検証
        const file = event.target.files[0];
        if (!file || !file.type.includes('png')) {
            alert('PNG画像ファイルを選択してください');
            return;
        }
        
        // ファイル名を保存（拡張子を除く）
        this.currentImageFileName = file.name.replace(/\.png$/i, '');
        
        // 画像を読み込み
        await this.loadImageFromFile(file);
    }

    /**
     * ファイルオブジェクトから画像を読み込み
     */
    async loadImageFromFile(file) {
        // FileReaderを使用して画像を読み込み
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            // 画像読み込み成功時の処理
            img.onload = () => {
                this.currentImage = img;
                this.setupCanvas();
                this.drawImage();
                this.enableControls();
                this.setEditingMode('point');  // デフォルトでポイント編集モードに設定
            };
            // 画像読み込み失敗時のエラーハンドリング
            img.onerror = () => {
                alert('画像の読み込みに失敗しました');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    

    
    /**
     * JSONファイルの読み込み処理（ポイントデータ）
     */
    handleJSONLoad(event) {
        // ファイル形式の検証
        const file = event.target.files[0];
        if (!file || !file.type.includes('json')) {
            alert('JSONファイルを選択してください');
            return;
        }
        
        // JSONファイルを読み込んでパース
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                this.loadPointsFromJSON(jsonData);
            } catch (error) {
                alert('JSONファイルの形式が正しくありません');
                console.error('JSON parse error:', error);
            }
        };
        reader.readAsText(file);
        
        // ファイル選択をクリア（同じファイルを再選択可能にする）
        event.target.value = '';
    }
    
    /**
     * JSONデータからポイントを復元して画面に配置
     */
    loadPointsFromJSON(data) {
        // 画像が読み込まれているかチェック
        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }
        
        // JSONデータの形式チェック
        if (!data.points || !Array.isArray(data.points)) {
            alert('JSONファイルにポイントデータが見つかりません');
            return;
        }
        
        // 座標変換用のスケール計算
        const scaleX = this.canvas.width / this.currentImage.width;
        const scaleY = this.canvas.height / this.currentImage.height;
        
        // JSONからポイントデータを復元
        data.points.forEach(pointData => {
            // 新しい形式（imageX, imageY）をチェック
            if (pointData.imageX !== undefined && pointData.imageY !== undefined) {
                // 元画像座標からキャンバス座標に変換
                const point = {
                    x: Math.round(pointData.imageX * scaleX),
                    y: Math.round(pointData.imageY * scaleY),
                    id: pointData.id || '',
                    isMarker: pointData.isMarker || false
                };
                this.points.push(point);
                this.createInputBox(point, this.points.length - 1);
            }
        });
        
        // 画面を更新
        this.drawImage();
        this.updatePointCount();
        
        // フォーカスをクリア
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
    }
    
    /**
     * 画像とポイントをCanvasに描画
     */
    drawImage() {
        if (!this.currentImage) return;
        
        // キャンバスをクリアして画像を描画
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.currentImage, 0, 0, this.canvas.width, this.canvas.height);
        
        // 全ポイントを描画
        this.drawAllPoints();
    }
    
    /**
     * キャンバスクリック時の処理（ポイント追加）
     */
    handleCanvasClick(event) {
        if (!this.currentImage) return;
        
        // マウス座標をキャンバス座標に変換
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
        
        // 編集モードに応じて適切なポイント追加メソッドを実行
        if (this.currentEditingMode === 'route') {
            this.addRoutePoint(x, y);
        } else if (this.currentEditingMode === 'point') {
            // 直前に追加された未入力ポイントがあれば破棄してから新規追加
            this.removeTrailingEmptyUserPoints();
            // 入力欄にフォーカスする新規ポイント追加
            this.addPoint(x, y, /*focusInput*/ true);
        }
    }
    
    /**
     * ポイント編集モードでのポイント追加
     */
    addPoint(x, y, focusInput = false) {
        // 新しいポイントオブジェクトを作成
        const point = { 
            x: Math.round(x), 
            y: Math.round(y),
            id: '',
            isMarker: false
        };
        
        // ポイントを配列に追加し、画面に表示
        this.points.push(point);
        this.drawPoint(point);
        this.createInputBox(point, this.points.length - 1, focusInput);
        this.updatePointCount();
    }
    
    /**
     * 単一ポイントを指定色・サイズで描画
     */
    drawPoint(point, color = '#ff0000', radius = 4, strokeWidth = 1.5) {
        // 描画スタイルを設定
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = strokeWidth;
        
        // 円を描画（塗りつぶし + 白い縁取り）
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.stroke();
    }
    
    /**
     * 全ポイント（通常ポイント・ルートポイント）を一括描画
     */
    drawAllPoints() {
        // 通常ポイントの描画（色・サイズを状態に応じて設定）
        this.points.forEach((point) => {
            let color = '#ff0000';      // デフォルト：赤
            let radius = 4;
            let strokeWidth = 1.5;
            
            // 開始・終了ポイントは青色で表示（ルート編集モード時またはstartPointId/endPointIdが設定されている場合）
            if ((this.currentEditingMode === 'route' || this.startPointId || this.endPointId) && 
                (point.id === this.startPointId || point.id === this.endPointId)) {
                color = '#0066ff';
            } else if (point.isMarker) {
                // JSONから読み込まれたマーカーは小さい青円で表示
                color = '#0066ff';
                radius = 3;
                strokeWidth = 1;
            }
            
            this.drawPoint(point, color, radius, strokeWidth);
        });
        
        // ルートの中間点を青色で描画（半径3px、白枠1px）
        this.routePoints.forEach(point => {
            this.drawPoint(point, '#0066ff', 3, 1);
        });
        
        // 入力ボックスを再描画（ルート編集モードでも表示されるようにする）
        this.redrawInputBoxes();
    }
    
    /**
     * 全ポイントをクリア（ポイント編集モード）
     */
    clearPoints() {
        this.points = [];
        this.clearInputBoxes();
        this.drawImage();
        this.updatePointCount();
    }
    
    /**
     * ポイント数表示を更新（マーカー除外）
     */
    updatePointCount() {
        // マーカーポイントを除外してカウント
        const userPoints = this.points.filter(point => !point.isMarker);
        document.getElementById('pointCount').textContent = userPoints.length;
    }
    
    /**
     * 画像読み込み後にボタンを有効化
     */
    enableControls() {
        document.getElementById('clearBtn').disabled = false;
        document.getElementById('exportBtn').disabled = false;
    }
    
    /**
     * ポイントデータをJSON形式で出力・ダウンロード
     */
    async exportJSON() {
        // ポイントが選択されているかチェック
        if (this.points.length === 0) {
            alert('ポイントが選択されていません');
            return;
        }
        
        // キャンバス座標を元画像座標に変換するスケール計算
        const scaleX = this.currentImage.width / this.canvas.width;
        const scaleY = this.currentImage.height / this.canvas.height;
        
        // JSONデータ構造を作成
        const data = {
            totalPoints: this.points.length,
            imageReference: this.currentImageFileName + '.png',
            imageInfo: {
                width: this.currentImage.width,
                height: this.currentImage.height
            },
            points: this.points.map((point, index) => ({
                index: index + 1,
                id: point.id || '',
                imageX: Math.round(point.x * scaleX),
                imageY: Math.round(point.y * scaleY),
                isMarker: point.isMarker || false
            })),
            exportedAt: new Date().toISOString()
        };
        
        // ユーザーがファイルを指定してダウンロード
        await this.downloadJSONWithUserChoice(data, 'points');
    }
    
    /**
     * ポイント用のID入力ボックスを動的生成
     */
    createInputBox(point, index, shouldFocus = false) {
        // マーカーポイントには入力ボックスを作成しない
        if (point.isMarker) {
            return;
        }
        
        // 入力要素を作成・設定
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 4;
        input.className = 'point-id-input';
        input.placeholder = 'ID';
        input.style.position = 'absolute';
        input.style.zIndex = '1000';
        
        // ポイント位置に応じて入力ボックスを配置
        this.positionInputBox(input, point);
        
        // 入力時の処理（小文字を大文字に自動変換）
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            const uppercaseValue = value.replace(/[a-z]/g, (match) => match.toUpperCase());
            this.points[index].id = uppercaseValue;
            if (uppercaseValue !== value) {
                e.target.value = uppercaseValue;
            }
        });
        
        // フォーカス離脱時の処理（空白時はポイント削除）
        input.addEventListener('blur', (e) => {
            const value = e.target.value.trim();
            // 座標を使って現在のポイントインデックスを特定
            const currentIndex = this.points.findIndex(p => p.x === point.x && p.y === point.y);
            
            // ポイント編集モードでID名が空白の場合はポイントを削除
            if (value === '' && this.currentEditingMode === 'point') {
                if (currentIndex >= 0) {
                    this.removePoint(currentIndex);
                }
                return;
            }
            
            // ID形式を自動修正
            const formattedValue = this.formatPointId(value);
            
            // 修正された値を入力フィールドに反映
            if (formattedValue !== value) {
                e.target.value = formattedValue;
            }
            
            // フォーマットチェックと背景色設定
            if (this.isValidPointIdFormat(formattedValue)) {
                // 正しい形式の場合は背景色をリセット
                e.target.style.backgroundColor = '';
            } else {
                // 正しくない形式の場合は薄いピンクに設定
                e.target.style.backgroundColor = '#ffe4e4';
            }
            
            // IDを更新
            if (currentIndex >= 0) {
                this.points[currentIndex].id = formattedValue;
            }
        });
        
        // DOMに要素を追加
        document.body.appendChild(input);
        this.inputElements.push(input);

        // 新規作成時は入力にフォーカスして、他をクリックした際にblurで未入力ポイントが削除されるようにする
        if (shouldFocus && (point.id ?? '') === '' && this.currentEditingMode === 'point') {
            setTimeout(() => input.focus(), 0);
        }
    }
    
    /**
     * 入力ボックスの最適な表示位置を計算・設定
     */
    positionInputBox(input, point) {
        // キャンバスの位置とスケールを取得
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;
        
        // 最適な横位置を計算（画面端を考慮）
        const inputX = this.findOptimalInputPosition(point.x, point.y, scaleX, rect.left);
        const inputY = point.y * scaleY + rect.top - 15;  // ポイントの少し上に配置
        
        // 位置を設定
        input.style.left = inputX + 'px';
        input.style.top = inputY + 'px';
    }
    
    /**
     * 画面端を考慮した入力ボックスの横位置計算
     */
    findOptimalInputPosition(pointX, pointY, scaleX, canvasLeft) {
        const inputWidth = 50;
        const margin = 10;
        const scaledPointX = pointX * scaleX + canvasLeft;
        
        // 右側配置と左側配置の位置を計算
        const rightPos = scaledPointX + margin;
        const leftPos = scaledPointX - inputWidth - margin;
        
        // 画面右端に収まるかチェックして最適位置を決定
        if (rightPos + inputWidth < window.innerWidth - 20) {
            return rightPos;
        } else {
            return Math.max(leftPos, canvasLeft + 5);
        }
    }
    
    /**
     * 全入力ボックスをクリア・再作成
     */
    redrawInputBoxes() {
        this.clearInputBoxes();
        // 少し遅延させてDOM更新を確実にする
        setTimeout(() => {
            this.points.forEach((point, index) => {
                if (point.isMarker) {
                    return;
                }
                // 入力ボックスを再作成
                this.createInputBox(point, index);
                const input = this.inputElements[this.inputElements.length - 1];
                if (input) {
                    input.value = point.id || '';
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
    
    /**
     * ポイントIDを「X-nn」形式に自動修正する
     * X: 半角英大文字1桁、nn: 半角数字2桁（1桁の場合は0埋め）
     * 全角英文字・全角数字を半角に変換してから処理する（平仮名・漢字が含まれていても変換）
     */
    formatPointId(value) {
        // 空文字の場合はそのまま返す
        if (!value || value.trim() === '') {
            return value;
        }
        
        // 全角文字の半角変換処理（平仮名・漢字が含まれていても全角英数字は変換）
        let convertedValue = this.convertFullWidthToHalfWidth(value);
        
        // 「英字-数字」または「英字数字」パターンをチェック
        const match1 = convertedValue.match(/^([A-Za-z])[-]?(\d{1,2})$/);
        if (match1) {
            const letter = match1[1].toUpperCase();
            const numbers = match1[2].padStart(2, '0');
            return `${letter}-${numbers}`;
        }
        
        // 「数字」のみの場合は半角変換のみ適用
        if (convertedValue.match(/^\d+$/)) {
            return convertedValue;
        }
        
        // X-nn形式に該当しない場合も、全角英数字の変換は適用する
        return convertedValue;
    }

    /**
     * ポイントIDが「X-nn」形式（英大文字1桁-数字2桁）かどうかをチェック
     */
    isValidPointIdFormat(value) {
        // 空文字の場合は有効とする
        if (!value || value.trim() === '') {
            return true;
        }
        
        // X-nn形式（英大文字1桁-数字2桁）の正規表現
        const validPattern = /^[A-Z]-\d{2}$/;
        return validPattern.test(value);
    }

    /**
     * 全角英文字と全角数字、全角ハイフンを半角に変換する
     * 全角英文字は半角大文字に変換
     */
    convertFullWidthToHalfWidth(str) {
        return str.replace(/[Ａ-Ｚａ-ｚ０-９－−‐―]/g, function(char) {
            // 全角英文字（Ａ-Ｚ）を半角大文字に変換
            if (char >= 'Ａ' && char <= 'Ｚ') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            // 全角小文字（ａ-ｚ）を半角大文字に変換
            if (char >= 'ａ' && char <= 'ｚ') {
                const halfWidthChar = String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
                return halfWidthChar.toUpperCase();
            }
            // 全角数字（０-９）を半角に変換
            if (char >= '０' && char <= '９') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            // 各種全角ハイフン・ダッシュ類を半角ハイフン（-）に変換
            if (char === '－' || char === '−' || char === '‐' || char === '―') {
                return '-';
            }
            return char;
        });
    }

    /**
     * 指定インデックスのポイントを削除
     */
    removePoint(index) {
        this.points.splice(index, 1);
        this.clearInputBoxes();
        this.drawImage();
        this.updatePointCount();
    }

    /**
     * 末尾に連続して存在する未入力（idが空）のユーザーポイントを削除
     * - JSONからのマーカー（isMarker=true）は対象外
     * - 一括削除後に1回だけ再描画・カウント更新
     */
    removeTrailingEmptyUserPoints() {
        if (this.points.length === 0) return;
        let removed = false;
        for (let i = this.points.length - 1; i >= 0; i--) {
            const point = this.points[i];
            if (point.isMarker) {
                // マーカーはスキップしてさらに前方を確認
                continue;
            }
            if ((point.id ?? '') === '') {
                this.points.splice(i, 1);
                removed = true;
                // さらに前にも未入力が続く場合に備えて継続
            } else {
                // 直近で未入力が終わったらそこで停止
                break;
            }
        }
        if (removed) {
            this.clearInputBoxes();
            this.drawImage();
            this.updatePointCount();
        }
    }
    
    /**
     * ルート中間点数表示を更新
     */
    updateWaypointCount() {
        document.getElementById('waypointCount').textContent = this.routePoints.length;
    }
    
    /**
     * ルート情報を全てクリア
     */
    clearRoute() {
        // ルートポイント配列をクリア
        this.routePoints = [];
        this.updateWaypointCount();
        
        // 開始・終了ポイントIDをクリア
        this.startPointId = '';
        this.endPointId = '';
        document.getElementById('startPointInput').value = '';
        document.getElementById('endPointInput').value = '';
        
        // 画面を再描画
        this.drawImage();
    }
    
    /**
     * ルートデータをJSON形式で出力・ダウンロード
     */
    async exportRouteJSON() {
        // ルートポイントが選択されているかチェック
        if (this.routePoints.length === 0) {
            alert('ルートポイントが選択されていません');
            return;
        }
        
        // 開始・終了ポイントがポイントとして登録されているかチェック
        const validationResult = this.validateStartEndPoints();
        if (!validationResult.isValid) {
            alert(validationResult.message);
            return;
        }
        
        // 座標変換用のスケール計算
        const scaleX = this.currentImage.width / this.canvas.width;
        const scaleY = this.currentImage.height / this.canvas.height;
        
        // ルートJSONデータ構造を作成
        const routeData = {
            routeInfo: {
                startPoint: this.startPointId || '',
                endPoint: this.endPointId || '',
                waypointCount: this.routePoints.length
            },
            imageReference: this.currentImageFileName + '.png',
            imageInfo: {
                width: this.currentImage.width,
                height: this.currentImage.height
            },
            points: this.routePoints.map((point, index) => ({
                type: 'waypoint',
                index: index + 1,
                imageX: Math.round(point.x * scaleX),
                imageY: Math.round(point.y * scaleY)
            })),
            exportedAt: new Date().toISOString()
        };
        
        // カスタムファイル名でダウンロード
        await this.downloadJSONWithUserChoice(routeData, 'route', this.generateRouteFilename());
    }
    
    /**
     * 開始・終了ポイントがポイントとして登録されているか検証
     */
    validateStartEndPoints() {
        const registeredPointIds = this.points.map(point => point.id).filter(id => id.trim() !== '');
        
        // 開始ポイントのチェック
        if (this.startPointId && !registeredPointIds.includes(this.startPointId)) {
            return {
                isValid: false,
                message: `開始ポイント "${this.startPointId}" がポイントとして登録されていません。先にポイント編集モードでポイントを登録してください。`
            };
        }
        
        // 終了ポイントのチェック
        if (this.endPointId && !registeredPointIds.includes(this.endPointId)) {
            return {
                isValid: false,
                message: `終了ポイント "${this.endPointId}" がポイントとして登録されていません。先にポイント編集モードでポイントを登録してください。`
            };
        }
        
        // 開始・終了ポイントが設定されているかチェック
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
     */
    generateRouteFilename() {
        const baseFileName = this.currentImageFileName || 'route';
        const startPoint = this.startPointId || 'start';
        const endPoint = this.endPointId || 'end';
        return `${baseFileName}_route_${startPoint}_to_${endPoint}.json`;
    }

    /**
     * ルート編集モードでの中間点追加
     */
    addRoutePoint(x, y) {
        // 新しいルートポイントを作成
        const point = { 
            x: Math.round(x), 
            y: Math.round(y)
        };
        
        // ルートポイント配列に追加し、青色で描画（半径3px、白枠1px）
        this.routePoints.push(point);
        this.drawPoint(point, '#0066ff', 3, 1);
        this.updateWaypointCount();
    }
    
    /**
     * ルートJSONファイルの読み込み処理
     */
    handleRouteJSONLoad(event) {
        // ファイル形式の検証
        const file = event.target.files[0];
        if (!file || !file.type.includes('json')) {
            alert('JSONファイルを選択してください');
            return;
        }
        
        // 画像読み込み確認
        if (!this.currentImage) {
            alert('先に画像を読み込んでください');
            return;
        }
        
        // JSONファイルを読み込み・パース
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                this.loadRouteFromJSON(jsonData);
            } catch (error) {
                alert('JSONファイルの形式が正しくありません');
                console.error('JSON parse error:', error);
            }
        };
        reader.readAsText(file);
        
        // ファイル選択をクリア
        event.target.value = '';
    }
    
    /**
     * JSONデータからルート情報を復元
     */
    loadRouteFromJSON(data) {
        // 読み込まれたJSONデータ全体をコンソールに出力（削除）
        
        // データ形式の検証
        if (!data.points || !Array.isArray(data.points) || !data.routeInfo) {
            alert('ルートJSONファイルの形式が正しくありません');
            return;
        }
        
        // routeInfoの詳細確認（削除）
        
        // 座標変換用のスケール計算
        const scaleX = this.canvas.width / this.currentImage.width;
        const scaleY = this.canvas.height / this.currentImage.height;
        
        // 既存ルートデータをクリア
        this.routePoints = [];
        
        // 開始・終了ポイントIDを設定
        this.startPointId = data.routeInfo.startPoint || '';
        this.endPointId = data.routeInfo.endPoint || '';
        document.getElementById('startPointInput').value = this.startPointId;
        document.getElementById('endPointInput').value = this.endPointId;
        
        // 中間点データを復元（元画像座標からキャンバス座標に変換）
        data.points.forEach(pointData => {
            if (pointData.type === 'waypoint') {
                // 新しい形式（imageX, imageY）をチェック
                if (pointData.imageX !== undefined && pointData.imageY !== undefined) {
                    const point = {
                        x: Math.round(pointData.imageX * scaleX),
                        y: Math.round(pointData.imageY * scaleY)
                    };
                    this.routePoints.push(point);
                }
            }
        });
        
        // UI更新
        this.updateWaypointCount();
        this.drawImage();
        
        // フォーカスをクリア
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
    }
    
    /**
     * JSONデータをファイルとしてダウンロード
     */
    downloadJSON(data, filename) {
        // JSON文字列に変換してBlobオブジェクトを作成
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // ダウンロードリンクを作成・実行
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // 一時要素とオブジェクトURLをクリーンアップ
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * ユーザーがファイルを指定してJSONデータをダウンロード（PNG画像と同じフォルダに保存）
     */
    async downloadJSONWithUserChoice(data, type, customFilename = null) {
        // JSON文字列に変換してBlobオブジェクトを作成
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // ファイル名を決定（カスタムファイル名優先、なければデフォルト生成）
        const defaultFilename = customFilename || (this.currentImageFileName ? 
            `${this.currentImageFileName}_${type}.json` : 
            `${type}_${new Date().toISOString().slice(0, 10)}.json`);
        
        try {
            // File System Access APIが利用可能かチェック
            if ('showSaveFilePicker' in window) {
                let fileHandle;
                let savePickerOptions = {
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'JSON Files',
                        accept: {
                            'application/json': ['.json']
                        }
                    }]
                };
                
                // PNG画像のファイルハンドルがある場合、同じディレクトリで保存ダイアログを開く
                if (this.currentImageFileHandle) {
                    try {
                        // PNG画像と同じディレクトリを開始ディレクトリとして設定
                        const parentDirectoryHandle = await this.currentImageFileHandle.getParent();
                        savePickerOptions.startIn = parentDirectoryHandle;
                    } catch (error) {
                        console.log('同じディレクトリの取得に失敗、デフォルトディレクトリを使用');
                    }
                }
                
                // 保存ダイアログを表示
                fileHandle = await window.showSaveFilePicker(savePickerOptions);
                
                // ファイルに書き込み
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                console.log(`JSONファイルが保存されました: ${fileHandle.name}`);
            } else {
                // フォールバック: 従来のダウンロード方式
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = defaultFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            // ユーザーがキャンセルした場合（AbortError）は何もしない
            if (error.name === 'AbortError') {
                console.log('ファイル保存がキャンセルされました');
                return;
            }
            
            console.error('ファイル保存エラー:', error);
            // その他のエラー時は従来のダウンロード方式にフォールバック
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
    
    /**
     * レイアウト管理と画面リサイズ対応の初期化
     */
    initializeLayoutManager() {
        // 初期状態の表示を設定
        this.updateLayoutDisplay();
        this.updateEditingModeDisplay();
        
        // ウィンドウリサイズ時のキャンバス再調整とポイント座標の変換
        window.addEventListener('resize', () => {
            if (this.currentImage) {
                setTimeout(() => {
                    this.handleWindowResize();
                }, 100);
            }
        });
    }
    
    /**
     * ウィンドウリサイズ時の処理
     * キャンバスサイズ変更に伴いポイントとルート座標も変換する
     */
    handleWindowResize() {
        if (!this.currentImage) return;
        
        // リサイズ前のキャンバスサイズを記録
        const oldCanvasWidth = this.canvas.width;
        const oldCanvasHeight = this.canvas.height;
        
        // キャンバスサイズを再設定
        this.setupCanvas();
        
        // 新しいキャンバスサイズを取得
        const newCanvasWidth = this.canvas.width;
        const newCanvasHeight = this.canvas.height;
        
        // サイズが変わった場合のみポイント座標を変換
        if (oldCanvasWidth !== newCanvasWidth || oldCanvasHeight !== newCanvasHeight) {
            // スケール比を計算
            const scaleX = newCanvasWidth / oldCanvasWidth;
            const scaleY = newCanvasHeight / oldCanvasHeight;
            
            // 通常ポイントの座標を変換
            this.points.forEach(point => {
                point.x = Math.round(point.x * scaleX);
                point.y = Math.round(point.y * scaleY);
            });
            
            // ルートポイントの座標を変換
            this.routePoints.forEach(point => {
                point.x = Math.round(point.x * scaleX);
                point.y = Math.round(point.y * scaleY);
            });
        }
        
        // 画像とポイントを再描画
        this.drawImage();
    }
    
    /**
     * 編集モードを変更
     */
    setEditingMode(mode) {
        this.currentEditingMode = mode;
        this.updateEditingModeDisplay();
    }
    
    /**
     * 編集モードに応じてUIパネルの表示・非表示を切り替え
     */
    updateEditingModeDisplay() {
        const pointEditor = document.getElementById('pointEditor');
        const routeEditor = document.getElementById('routeEditor');
        
        // 編集モードに応じてパネル表示を切り替え
        if (this.currentEditingMode === 'point') {
            pointEditor.style.display = 'flex';
            routeEditor.style.display = 'none';
        } else {
            pointEditor.style.display = 'none';
            routeEditor.style.display = 'block';
        }
        
        // ラジオボタンの選択状態を同期
        const radio = document.querySelector(`input[name="editingMode"][value="${this.currentEditingMode}"]`);
        if (radio) {
            radio.checked = true;
        }
    }
    
    /**
     * レイアウトを変更（サイドバー/オーバーレイ）
     */
    setLayout(layout) {
        this.currentLayout = layout;
        this.updateLayoutDisplay();
        
        // レイアウト変更時にキャンバスサイズを再調整
        if (this.currentImage) {
            setTimeout(() => {
                this.handleWindowResize();
            }, 300);
        }
    }
    
    /**
     * レイアウト変更に応じてCSS data属性とラジオボタンを更新
     */
    updateLayoutDisplay() {
        // メインコンテンツにレイアウト属性を設定
        const mainContent = document.querySelector('.main-content');
        mainContent.setAttribute('data-layout', this.currentLayout);
        
        // ラジオボタンの選択状態を同期
        const radio = document.querySelector(`input[name="layout"][value="${this.currentLayout}"]`);
        if (radio) {
            radio.checked = true;
        }
    }
    
    /**
     * 読み込まれた画像サイズに応じてキャンバスサイズを設定
     */
    setupCanvas() {
        if (!this.currentImage) return;
        
        // コンテナサイズを取得
        const container = this.canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        
        // レイアウトモードに応じて利用可能サイズを計算
        let availableWidth, availableHeight;
        
        if (this.currentLayout === 'sidebar') {
            availableWidth = containerRect.width - 40;
            availableHeight = window.innerHeight - 140;
        } else {
            availableWidth = window.innerWidth - 40;
            availableHeight = window.innerHeight - 140;
        }
        
        // 画像のアスペクト比を維持したキャンバスサイズを計算
        const imageAspectRatio = this.currentImage.height / this.currentImage.width;
        
        let canvasWidth = availableWidth;
        let canvasHeight = canvasWidth * imageAspectRatio;
        
        // 高さが制限を超える場合は高さ基準でサイズ調整
        if (canvasHeight > availableHeight) {
            canvasHeight = availableHeight;
            canvasWidth = canvasHeight / imageAspectRatio;
        }
        
        // キャンバスの実サイズとCSSサイズを設定
        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
        this.canvas.style.display = 'block';
        this.canvas.style.visibility = 'visible';
    }
}

// DOM読み込み完了後にアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new PickPoints();
});