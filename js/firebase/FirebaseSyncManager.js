import { CoordinateUtils } from '../utils/Coordinates.js';
import { UIHelper } from '../ui/UIHelper.js';
import { SYNC_KINDS, captureLocal, localState, planSync, remoteState } from './SyncPlanner.js';

// 確認・エラーのメッセージに列挙する項目数の上限
const MAX_LISTED_ITEMS = 10;

/**
 * Firebase同期処理を管理するクラス
 * ポイント、スポット、ルートのFirestore連携を担当
 */
export class FirebaseSyncManager {
    /**
     * コンストラクタ
     * @param {Object} pointManager - PointManagerインスタンス
     * @param {Object} spotManager - SpotManagerインスタンス
     * @param {Object} routeManager - RouteManagerインスタンス

     * @param {Object} areaManager - AreaManagerインスタンス
     * @param {Object} fileHandler - FileHandlerインスタンス
     */
    constructor(pointManager, spotManager, routeManager, areaManager, fileHandler) {
        this.pointManager = pointManager;
        this.spotManager = spotManager;
        this.routeManager = routeManager;
        this.areaManager = areaManager;
        this.fileHandler = fileHandler;
        this.currentImage = null;
        this.canvas = null;
        this.canvasRenderer = null;
        // 読み込み・保存の処理中フラグ（読み込みと保存の同時実行も防ぐ）
        this.busy = false;
        this.resetBaselines();
    }

    /**
     * 基準情報を初期化（基準情報の無いFirestore上のデータは、保存時に削除しない）
     */
    resetBaselines() {
        this.baselines = new Map(SYNC_KINDS.map((kind) => [kind.name, new Map()]));
    }

    /**
     * 画面側のデータを種別ごとに取得
     * @param {Object} kind - SYNC_KINDSの要素
     * @returns {Array}
     */
    getLocalItems(kind) {
        switch (kind.name) {
            case 'points': return this.pointManager.getPoints();
            case 'routes': return this.routeManager.getAllRoutes();
            case 'spots': return this.spotManager.getSpots();
            case 'areas': return this.areaManager.getAllAreas();
            default: return [];
        }
    }

    /**
     * 読み込み・保存した時点の内容を基準情報として記録
     */
    remember(kind, item, id, local, remote) {
        item.firestoreId = id;
        this.baselines.get(kind.name).set(id, { local, remote });
    }

    /**
     * 座標を一括で再計算する処理（リサイズ）の前後で、「画面で未変更」の状態を維持
     * @param {Function} recalculate - 座標を再計算する処理
     */
    keepUnchangedAcross(recalculate) {
        const unchanged = SYNC_KINDS.flatMap((kind) => this.getLocalItems(kind)
            .map((item) => ({ kind, item, known: this.baselines.get(kind.name).get(item.firestoreId) }))
            .filter(({ item, known }) => known && known.local === localState(kind, item)));

        recalculate();

        unchanged.forEach(({ kind, item, known }) => {
            known.local = localState(kind, item);
        });
    }

    /**
     * ズーム倍率に依存しないキャンバスサイズを取得
     * （通信待ちの間にズームされても座標変換が狂わないようにする）
     * @returns {{width:number, height:number}}
     */
    getBaseSize() {
        return {
            width: Math.trunc(this.canvasRenderer.baseWidth),
            height: Math.trunc(this.canvasRenderer.baseHeight)
        };
    }

    /**
     * 現在の画像とキャンバスを設定
     * @param {HTMLImageElement} image - 現在の画像
     * @param {HTMLCanvasElement} canvas - キャンバス要素
     * @param {Object} canvasRenderer - CanvasRendererインスタンス
     */
    setImageAndCanvas(image, canvas, canvasRenderer) {
        this.currentImage = image;
        this.canvas = canvas;
        this.canvasRenderer = canvasRenderer;
        this.resetBaselines();
    }

    /**
     * 座標でポイントをFirebaseから削除
     * @param {number} x - キャンバスX座標
     * @param {number} y - キャンバスY座標
     */
    async deletePointFromFirebase(x, y) {
        // Firebaseマネージャーの存在確認
        if (!window.firestoreManager) {
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                x, y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // 同じ座標のポイントをFirestoreから検索・削除
            const points = await window.firestoreManager.getPoints(projectId);
            const tolerance = 1.0; // 誤差許容範囲（1px）

            for (const point of points) {
                const dx = Math.abs(point.x - imageCoords.x);
                const dy = Math.abs(point.y - imageCoords.y);

                if (dx <= tolerance && dy <= tolerance) {
                    await window.firestoreManager.deletePoint(projectId, point.firestoreId);
                    break;
                }
            }
        } catch (error) {
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
            return;
        }

        // 画像が読み込まれているか確認
        if (!this.currentImage) {
            return;
        }

        // プロジェクトIDを画像ファイル名から取得
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            return;
        }

        try {
            // キャンバス座標から画像座標に変換
            const imageCoords = CoordinateUtils.canvasToImage(
                x, y,
                this.canvas.width, this.canvas.height,
                this.currentImage.width, this.currentImage.height
            );

            // 同じ座標のスポットをFirestoreから検索・削除
            const spots = await window.firestoreManager.getSpots(projectId);
            const tolerance = 1.0; // 誤差許容範囲（1px）

            for (const spot of spots) {
                const dx = Math.abs(spot.x - imageCoords.x);
                const dy = Math.abs(spot.y - imageCoords.y);

                if (dx <= tolerance && dy <= tolerance) {
                    await window.firestoreManager.deleteSpot(projectId, spot.firestoreId);
                    break;
                }
            }
        } catch (error) {
            // エラーが発生してもユーザーには通知しない（バックグラウンド処理）
        }
    }

    /**
     * ルートをFirebaseから削除
     * @param {string} firestoreId - Firestore ID
     */
    async deleteRouteFromFirebase(firestoreId) {
        if (!window.firestoreManager || !this.currentImage || !firestoreId) return;
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        try {
            await window.firestoreManager.deleteRoute(projectId, firestoreId);
        } catch (error) {
            console.error('ルート削除エラー:', error);
        }
    }

    /**
     * エリア名の変更をFirebaseに即時反映
     * 名前のみを更新する。未保存のエリアや、他の変更・同名のエリアがある場合は保存時の処理に委ねる
     * @param {number} areaIndex - エリアのインデックス
     */
    async updateAreaToFirebase(areaIndex) {
        if (!window.firestoreManager || !this.currentImage || this.busy) return;

        const projectId = this.fileHandler.getCurrentImageFileName();
        const area = this.areaManager.getAllAreas()[areaIndex];
        if (!projectId || !area) return;

        const kind = SYNC_KINDS.find(({ name }) => name === 'areas');
        const known = this.baselines.get(kind.name).get(area.firestoreId);
        const { firestoreId, areaName } = area;
        if (!known || !kind.isValid({ areaName })) return;

        this.busy = true;
        try {
            const remoteAreas = await window.firestoreManager.getAreas(projectId);
            const target = remoteAreas.find((remote) => remote.firestoreId === firestoreId);
            if (!target || remoteState(kind, target) !== known.remote) return;
            if (remoteAreas.some((remote) => remote !== target && kind.key(remote) === kind.key({ areaName }))) return;

            await window.firestoreManager.updateArea(projectId, firestoreId, { areaName });

            known.remote = remoteState(kind, { ...target, areaName });
            known.local = JSON.stringify({ ...JSON.parse(known.local), areaName });
        } catch (error) {
            console.error('エリア保存エラー:', error);
        } finally {
            this.busy = false;
        }
    }

    /**
     * エリアをFirebaseから削除
     * @param {string} firestoreId - Firestore ID
     */
    async deleteAreaFromFirebase(firestoreId) {
        if (!window.firestoreManager || !this.currentImage || !firestoreId) return;
        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) return;

        try {
            await window.firestoreManager.deleteArea(projectId, firestoreId);
        } catch (error) {
            console.error('エリア削除エラー:', error);
        }
    }

    /**
     * Firebaseからデータを読み込み
     * @param {Function} onLoadComplete - 読み込み完了時のコールバック
     */
    async loadFromFirebase(onLoadComplete) {
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

        if (this.busy) {
            UIHelper.showWarning('データベースの処理中です。完了までお待ちください');
            return;
        }

        this.busy = true;
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
                UIHelper.showWarning(`画像 ${projectId} に対するデータがありません`);
                // データがない場合でも処理を続行（新規プロジェクトとして扱う）
                if (onLoadComplete) {
                    onLoadComplete(0, 0, 0);
                }
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

            // 件数取得用に各コレクションを先読み（0件項目は処理をスキップしてメッセージも出さない）
            // 取得に失敗しても画面のデータを失わないよう、クリアは全種別の取得後に行う
            const points = await window.firestoreManager.getPoints(projectId);
            const routes = await window.firestoreManager.getRoutes(projectId);
            const spots = await window.firestoreManager.getSpots(projectId);
            const areas = (window.firestoreManager.getAreas)
                ? await window.firestoreManager.getAreas(projectId)
                : [];

            this.pointManager.clearPoints();
            this.routeManager.clearAllRoutes();
            this.spotManager.clearSpots();
            this.areaManager.clearAreas();
            this.resetBaselines();

            const { width, height } = this.getBaseSize();
            const [pointKind, routeKind, spotKind, areaKind] = SYNC_KINDS;
            const rememberLoaded = (kind, item, doc) =>
                this.remember(kind, item, doc.firestoreId, localState(kind, item), remoteState(kind, doc));

            // ポイントを読み込み（画像座標→キャンバス座標に変換）
            let loadedPoints = 0;
            if (points.length > 0) {
                UIHelper.showPersistentMessage('ポイントのデータを読み込み中...', 'info');
            }
            for (const point of points) {
                // 空白IDはスキップ
                if (!point.id || point.id.trim() === '') {
                    continue;
                }

                // 画像座標からキャンバス座標に変換
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    point.x, point.y,
                    width, height,
                    this.currentImage.width, this.currentImage.height
                );

                const addedPoint = this.pointManager.addPoint(canvasCoords.x, canvasCoords.y, point.id);
                rememberLoaded(pointKind, addedPoint, point);
                loadedPoints++;
            }

            // ルートを読み込み（画像座標→キャンバス座標に変換）
            let loadedRoutes = 0;
            if (routes.length > 0) {
                UIHelper.showPersistentMessage('ルートのデータを読み込み中...', 'info');
            }
            for (const route of routes) {
                // 中間点の座標変換
                const convertedWaypoints = [];
                for (const waypoint of route.waypoints || []) {
                    // 画像座標からキャンバス座標に変換
                    const canvasCoords = CoordinateUtils.imageToCanvas(
                        waypoint.x, waypoint.y,
                        width, height,
                        this.currentImage.width, this.currentImage.height
                    );
                    convertedWaypoints.push({ x: canvasCoords.x, y: canvasCoords.y });
                }

                // ルートオブジェクトを作成してRouteManagerに追加
                // FirestoreIDを保持して、更新時に使用できるようにする
                const addedRoute = {
                    routeName: route.routeName || `${route.startPoint} ～ ${route.endPoint}`,
                    startPointId: route.startPoint,
                    endPointId: route.endPoint,
                    routePoints: convertedWaypoints
                };
                this.routeManager.addRoute(addedRoute);
                rememberLoaded(routeKind, addedRoute, route);
                loadedRoutes++;
            }

            // スポットを読み込み（画像座標→キャンバス座標に変換）
            let loadedSpots = 0;
            if (spots.length > 0) {
                UIHelper.showPersistentMessage('スポットのデータを読み込み中...', 'info');
            }
            for (const spot of spots) {
                // 空白名はスキップ
                if (!spot.name || spot.name.trim() === '') {
                    continue;
                }

                // 画像座標からキャンバス座標に変換
                const canvasCoords = CoordinateUtils.imageToCanvas(
                    spot.x, spot.y,
                    width, height,
                    this.currentImage.width, this.currentImage.height
                );

                const addedSpot = this.spotManager.addSpot(canvasCoords.x, canvasCoords.y, spot.name);
                rememberLoaded(spotKind, addedSpot, spot);
                loadedSpots++;

            }

            // エリアを読み込み
            let loadedAreas = 0;
            if (areas.length > 0) {
                UIHelper.showPersistentMessage('エリアのデータを読み込み中...', 'info');
            }
            for (const area of areas) {
                const convertedVertices = [];
                if (area.vertices) {
                    for (const vertex of area.vertices) {
                        const canvasCoords = CoordinateUtils.imageToCanvas(
                            vertex.x, vertex.y,
                            width, height,
                            this.currentImage.width, this.currentImage.height
                        );
                        convertedVertices.push({ x: canvasCoords.x, y: canvasCoords.y });
                    }
                }

                const addedArea = {
                    areaName: area.areaName,
                    vertices: convertedVertices
                };
                this.areaManager.addArea(addedArea);
                rememberLoaded(areaKind, addedArea, area);
                loadedAreas++;
            }

            // 読み込み完了コールバックを実行
            if (onLoadComplete) {
                onLoadComplete(loadedPoints, loadedRoutes, loadedSpots);
            }

            // 進捗用の永続メッセージを消去してから、完了メッセージを規定秒数表示
            UIHelper.hidePersistentMessage();

            const completionLines = ['読み込みが完了しました。'];
            if (loadedPoints > 0) completionLines.push(`ポイント: ${loadedPoints}件`);
            if (loadedRoutes > 0) completionLines.push(`ルート: ${loadedRoutes}件`);
            if (loadedSpots > 0)  completionLines.push(`スポット: ${loadedSpots}件`);
            if (loadedAreas > 0)  completionLines.push(`エリア: ${loadedAreas}件`);
            if (completionLines.length === 1) completionLines.push('データなし');
            UIHelper.showMessage(completionLines.join('\n'), 'success');

        } catch (error) {
            UIHelper.hidePersistentMessage();
            UIHelper.showError('読み込み中にエラーが発生しました: ' + error.message);
        } finally {
            this.busy = false;
        }
    }

    /**
     * すべてのデータをFirebaseに保存
     * 保存内容の決め方は SyncPlanner.js を参照
     */
    async saveAllToFirebase() {
        if (!window.firestoreManager || !this.currentImage) {
            UIHelper.showError('Firebase接続または画像がありません');
            return;
        }

        const projectId = this.fileHandler.getCurrentImageFileName();
        if (!projectId) {
            UIHelper.showError('プロジェクトIDが不明です');
            return;
        }

        if (this.busy) {
            UIHelper.showWarning('データベースの処理中です。完了までお待ちください');
            return;
        }

        this.busy = true;
        try {
            const { width: imageWidth, height: imageHeight } = this.currentImage;
            const { width, height } = this.getBaseSize();
            const toImage = ({ x, y }) => CoordinateUtils.canvasToImage(x, y, width, height, imageWidth, imageHeight);
            // JSON入出力とDBの座標変換で生じる丸め誤差の範囲
            const tolerance = {
                x: Math.ceil(1.5 * imageWidth / width) + 1,
                y: Math.ceil(1.5 * imageHeight / height) + 1
            };

            // 通信待ちの前に画面のデータを写し取る
            const captured = SYNC_KINDS.map((kind) => ({
                kind,
                entries: captureLocal(kind, this.getLocalItems(kind), toImage)
            }));

            // メタデータは各データより先に読む（読み取り中に行われた他の保存を検出するため）
            const projectBefore = await window.firestoreManager.getProjectMetadata(projectId);
            const readers = {
                points: () => window.firestoreManager.getPoints(projectId),
                routes: () => window.firestoreManager.getRoutes(projectId),
                spots: () => window.firestoreManager.getSpots(projectId),
                areas: () => window.firestoreManager.getAreas(projectId)
            };

            const plans = [];
            for (const { kind, entries } of captured) {
                if (entries.length > 0) {
                    UIHelper.showPersistentMessage(`${kind.label}のデータを保存中...`, 'info');
                }
                const remoteDocs = await readers[kind.name]();
                plans.push(planSync(kind, entries, remoteDocs, this.baselines.get(kind.name), tolerance));
            }

            const duplicates = plans.flatMap((plan) => plan.duplicates);
            if (duplicates.length > 0) {
                UIHelper.hidePersistentMessage();
                UIHelper.showMessageWithOk(
                    '次の項目が画面内またはデータベース上の別のデータと重複するため、保存しませんでした。\n'
                    + 'ID・名前・開始/終了ポイントを変更してから保存してください。\n'
                    + this.formatItemList(duplicates),
                    'error'
                );
                return;
            }

            const conflicts = plans.flatMap((plan) => plan.conflicts);
            if (conflicts.length > 0) {
                UIHelper.hidePersistentMessage();
                const confirmed = confirm(
                    '読み込んでいないデータ、または読み込んだ後に他で変更されたデータが対象に含まれています。\n\n'
                    + this.formatItemList(conflicts)
                    + '\n\n画面の内容で保存しますか？'
                );
                if (!confirmed) {
                    UIHelper.showWarning('保存をキャンセルしました。データベースは変更していません');
                    return;
                }
            }

            UIHelper.showPersistentMessage('削除データを同期中...', 'info');
            const metadata = {
                projectName: projectId,
                imageName: projectId + '.png',
                imageWidth,
                imageHeight
            };
            await window.firestoreManager.commitSync(projectId, metadata, projectBefore, plans);

            this.updateBaselines(plans);

            // 進捗用の永続メッセージを消去してから、完了メッセージを規定秒数表示
            UIHelper.hidePersistentMessage();
            UIHelper.showMessage(this.buildSaveSummary(plans), 'success');

        } catch (error) {
            console.error('全データ保存エラー:', error);
            UIHelper.hidePersistentMessage();
            UIHelper.showError(error.code === 'sync-conflict'
                ? '保存中に他で変更があったため中止しました（データベースは変更していません）。もう一度「保存」を実行してください'
                : '保存中にエラーが発生しました。画面のデータは残っています。もう一度「保存」を実行してください');
        } finally {
            this.busy = false;
        }
    }

    /**
     * 保存成功後に基準情報を更新
     * @param {Array} plans - 保存内容
     */
    updateBaselines(plans) {
        plans.forEach(({ kind, adds, updates, deletes, settled, linked }) => {
            const baseline = this.baselines.get(kind.name);
            deletes.forEach(({ id }) => baseline.delete(id));
            [...adds, ...updates].forEach(({ entry, id, content }) =>
                this.remember(kind, entry.item, id, entry.local, remoteState(kind, content)));
            settled.forEach(({ entry, id, state }) => this.remember(kind, entry.item, id, entry.local, state));
            linked.forEach(({ entry, id }) => {
                entry.item.firestoreId = id;
            });
        });
    }

    /**
     * 保存完了メッセージを作成
     * @param {Array} plans - 保存内容
     * @returns {string}
     */
    buildSaveSummary(plans) {
        const lines = ['保存が完了しました。'];
        plans.forEach(({ kind, adds, updates, settled, linked }) => {
            const count = adds.length + updates.length + settled.length + linked.length;
            if (count > 0) lines.push(`${kind.label}: ${count}件`);
        });

        const deleted = plans.reduce((total, plan) => total + plan.deletes.length, 0);
        if (deleted > 0) lines.push(`削除: ${deleted}件`);

        const unseen = plans.reduce((total, plan) => total + plan.unseen, 0);
        if (unseen > 0) lines.push(`未読み込みのため削除せず残したデータ: ${unseen}件`);

        if (lines.length === 1) lines.push('データなし');
        return lines.join('\n');
    }

    /**
     * 項目名の一覧を作成
     * @param {Array<string>} items - 項目名
     * @returns {string}
     */
    formatItemList(items) {
        const omitted = items.length > MAX_LISTED_ITEMS ? `\n…ほか${items.length - MAX_LISTED_ITEMS}件` : '';
        return items.slice(0, MAX_LISTED_ITEMS).map((item) => `・${item}`).join('\n') + omitted;
    }
}
