/**
 * SyncPlanner.js
 * 画面のデータとFirestoreのデータを照合し、保存内容（追加・更新・削除）を決める
 * Firestoreへのアクセスは行わない
 *
 * 【原則】
 * - 照合はFirestoreのドキュメントIDが優先。IDが無い項目に限り、ID・名前等のキーで照合する
 * - 削除は、このタブで読み込みまたは保存した（＝基準情報がある）ドキュメントに限る
 * - 読み込み・保存の後に画面で変更していない項目は書き込まない
 *
 * 【基準情報（baseline）】ドキュメントID → { local, remote }
 * - local : 読み込み・保存した時点の画面側の内容（キャンバス座標）
 * - remote: 同じ時点のFirestore側の内容（画像座標）
 */

const trimmed = (value) => String(value ?? '').trim();
const toXY = ({ x, y }) => ({ x, y });

/**
 * データ種別ごとの定義
 * - pick     : 照合・保存の対象フィールドを、決まった順序で取り出す
 * - fromLocal: 画面側のオブジェクトをFirestoreのフィールド名に揃える
 * - key      : ドキュメントIDが無い場合の照合キー（null = 内容全体で照合する）
 * - unique   : キーの重複を許さないか（falseの場合、キーと座標の両方で照合する）
 */
export const SYNC_KINDS = [
    {
        name: 'points',
        label: 'ポイント',
        counter: 'pointCount',
        unique: true,
        defaults: { index: 0, isMarker: false },
        pick: (d) => ({ id: d.id ?? '', x: d.x, y: d.y }),
        isValid: (d) => trimmed(d.id) !== '',
        key: (d) => trimmed(d.id) || null,
        describe: (d) => d.id,
        coords: (d) => [toXY(d)],
        mapCoords: (d, convert) => ({ ...d, ...convert(d) }),
        derive: () => ({})
    },
    {
        name: 'routes',
        label: 'ルート',
        counter: 'routeCount',
        unique: true,
        defaults: { description: '' },
        pick: (d) => ({
            routeName: d.routeName ?? '',
            startPoint: d.startPoint ?? '',
            endPoint: d.endPoint ?? '',
            waypoints: (d.waypoints || []).map(toXY),
            // 説明は画面で編集しないため、持っていない場合はFirestore側の値を残す
            ...(typeof d.description === 'string' && { description: d.description })
        }),
        fromLocal: (route) => ({
            routeName: route.routeName || 'Unnamed Route',
            startPoint: route.startPointId,
            endPoint: route.endPointId,
            waypoints: route.routePoints,
            description: route.description
        }),
        isValid: () => true,
        key: (d) => (d.startPoint || d.endPoint) ? JSON.stringify([d.startPoint, d.endPoint]) : null,
        describe: (d) => `${d.startPoint || '未設定'} ～ ${d.endPoint || '未設定'}`,
        coords: (d) => d.waypoints,
        mapCoords: (d, convert) => ({ ...d, waypoints: d.waypoints.map(convert) }),
        derive: (d) => ({ waypointCount: d.waypoints.length })
    },
    {
        name: 'spots',
        label: 'スポット',
        counter: 'spotCount',
        unique: false, // 離れた場所の同名スポット（「分岐」等）は別データ
        defaults: { index: 0, description: '', category: '' },
        pick: (d) => ({ name: d.name ?? '', x: d.x, y: d.y }),
        isValid: (d) => trimmed(d.name) !== '',
        key: (d) => trimmed(d.name) || null,
        describe: (d) => d.name,
        coords: (d) => [toXY(d)],
        mapCoords: (d, convert) => ({ ...d, ...convert(d) }),
        derive: () => ({})
    },
    {
        name: 'areas',
        label: 'エリア',
        counter: 'areaCount',
        unique: true,
        defaults: {},
        pick: (d) => ({ areaName: d.areaName ?? '', vertices: (d.vertices || []).map(toXY) }),
        isValid: (d) => trimmed(d.areaName) !== '',
        key: (d) => trimmed(d.areaName) || null,
        describe: (d) => d.areaName,
        coords: (d) => d.vertices,
        mapCoords: (d, convert) => ({ ...d, vertices: d.vertices.map(convert) }),
        derive: (d) => ({ vertexCount: d.vertices.length })
    }
];

/**
 * Firestore側の内容を比較用の文字列に変換
 * @param {Object} kind - SYNC_KINDSの要素
 * @param {Object} data - Firestoreのドキュメントデータ
 * @returns {string}
 */
export function remoteState(kind, data) {
    return JSON.stringify(kind.pick(data));
}

/**
 * 画面側の内容を比較用の文字列に変換
 * @param {Object} kind - SYNC_KINDSの要素
 * @param {Object} item - 画面側のオブジェクト
 * @returns {string}
 */
export function localState(kind, item) {
    return JSON.stringify(localContent(kind, item));
}

function localContent(kind, item) {
    return kind.pick(kind.fromLocal ? kind.fromLocal(item) : item);
}

/**
 * 画面側のデータを保存用に写し取る（非同期処理の間に変化しても影響を受けないようにする）
 * @param {Object} kind - SYNC_KINDSの要素
 * @param {Array} items - 画面側のオブジェクト配列
 * @param {Function} toImage - キャンバス座標→画像座標の変換
 * @returns {Array<{item:Object, id:string|undefined, local:string, content:Object}>}
 */
export function captureLocal(kind, items, toImage) {
    return items
        .map((item) => ({ item, id: item.firestoreId, canvasContent: localContent(kind, item) }))
        .filter(({ canvasContent }) => kind.isValid(canvasContent))
        .map(({ item, id, canvasContent }) => ({
            item,
            id,
            local: JSON.stringify(canvasContent),
            content: kind.mapCoords(canvasContent, toImage)
        }));
}

/**
 * 1種別分の保存内容を決める
 * @param {Object} kind - SYNC_KINDSの要素
 * @param {Array} entries - captureLocal()の戻り値
 * @param {Array} remoteDocs - Firestoreのドキュメント配列（firestoreIdを含む）
 * @param {Map} baseline - 基準情報
 * @param {{x:number, y:number}} tolerance - 座標変換の丸め誤差として許容する画素数
 * @returns {Object} 保存内容
 */
export function planSync(kind, entries, remoteDocs, baseline, tolerance) {
    const remote = remoteDocs.map((doc) => ({
        id: doc.firestoreId,
        content: kind.pick(doc),
        state: remoteState(kind, doc)
    }));
    const unclaimed = new Map(remote.map((doc) => [doc.id, doc]));
    const plan = {
        kind,
        remoteCount: remote.length,
        adds: [],      // 追加
        updates: [],   // 更新
        deletes: [],   // 削除
        settled: [],   // 内容が一致しており書き込み不要（基準情報は更新する）
        linked: [],    // 画面で未変更のため書き込み不要（基準情報も変えない）
        conflicts: [], // 上書き・削除の前に確認が必要な項目の名前
        duplicates: [],// キーが重複するため保存できない項目の名前
        unseen: 0      // 画面に無いが、削除せずに残す件数
    };

    // 1. ドキュメントIDで照合（改名・移動しても同じドキュメントを更新するため、キー照合より先に全件行う）
    const pairs = entries.map((entry) => {
        const target = entry.id ? unclaimed.get(entry.id) : undefined;
        if (target) unclaimed.delete(target.id);

        // 他の人が削除し、画面では変更していない項目は復活させない
        const removedByOthers = !target && !!entry.id && baseline.get(entry.id)?.local === entry.local;
        return { entry, target, removedByOthers };
    }).filter((pair) => !pair.removedByOthers);

    // 2. IDで照合できなかった項目はキーで照合
    pairs.forEach((pair) => {
        if (pair.target) return;
        pair.target = findByKey(kind, pair.entry.content, unclaimed, baseline, tolerance);
        if (pair.target) unclaimed.delete(pair.target.id);
    });

    // 3. 追加・更新の判定
    pairs.forEach(({ entry, target }) => {
        if (!target) {
            plan.adds.push({ entry, content: kind.pick({ ...kind.defaults, ...entry.content }) });
            return;
        }

        const known = baseline.get(target.id);
        if (known?.local === entry.local) {
            plan.linked.push({ entry, id: target.id });
            return;
        }

        const content = kind.pick({ ...target.content, ...entry.content });
        const isSame = JSON.stringify(content) === target.state
            || (!known && isWithinTolerance(kind, content, target.content, tolerance));
        if (isSame) {
            plan.settled.push({ entry, id: target.id, state: target.state });
            return;
        }

        plan.updates.push({ entry, id: target.id, before: target.state, content });
        if (known?.remote !== target.state) {
            plan.conflicts.push(`${kind.label}「${kind.describe(target.content)}」の上書き`);
        }
    });

    // 4. 削除の判定（基準情報の無いドキュメントは削除しない）
    unclaimed.forEach((doc) => {
        const known = baseline.get(doc.id);
        if (!known) {
            if (kind.isValid(doc.content)) plan.unseen++;
            return;
        }
        plan.deletes.push({ id: doc.id, before: doc.state });
        if (known.remote !== doc.state) {
            plan.conflicts.push(`${kind.label}「${kind.describe(doc.content)}」の削除`);
        }
    });

    if (kind.unique) plan.duplicates = findDuplicates(kind, remote, plan);

    return plan;
}

function findByKey(kind, content, unclaimed, baseline, tolerance) {
    const key = kind.key(content);
    if (key === null) {
        // キーが無い項目（始終点とも未設定のルート）は、内容が一致する場合のみ同一とみなす
        return [...unclaimed.values()].find((doc) => kind.key(doc.content) === null
            && isWithinTolerance(kind, kind.pick({ ...doc.content, ...content }), doc.content, tolerance));
    }

    const candidates = [...unclaimed.values()].filter((doc) => kind.key(doc.content) === key
        && (kind.unique || isNear(kind.coords(doc.content), kind.coords(content), tolerance)));

    if (kind.unique) {
        return candidates.find((doc) => baseline.has(doc.id)) || candidates[0];
    }

    const distance = (doc) => Math.hypot(doc.content.x - content.x, doc.content.y - content.y);
    return candidates.sort((a, b) => distance(a) - distance(b))[0];
}

function isNear(a, b, tolerance) {
    return a.length === b.length && a.every((point, i) =>
        Math.abs(point.x - b[i].x) <= tolerance.x && Math.abs(point.y - b[i].y) <= tolerance.y);
}

function isWithinTolerance(kind, a, b, tolerance) {
    const withoutCoords = (content) => JSON.stringify(kind.mapCoords(content, () => ({ x: 0, y: 0 })));
    return withoutCoords(a) === withoutCoords(b) && isNear(kind.coords(a), kind.coords(b), tolerance);
}

/**
 * 保存後の状態でキーが重複する項目を検出（今回書き込む項目に関わるものに限る）
 */
function findDuplicates(kind, remote, plan) {
    const replaced = new Set([...plan.updates, ...plan.deletes].map(({ id }) => id));
    const written = [...plan.adds, ...plan.updates].map(({ content }) => content);
    const result = [...remote.filter((doc) => !replaced.has(doc.id)).map((doc) => doc.content), ...written];

    const counts = new Map();
    result.forEach((content) => {
        const key = kind.key(content);
        if (key !== null) counts.set(key, (counts.get(key) || 0) + 1);
    });

    const names = written
        .filter((content) => counts.get(kind.key(content)) > 1)
        .map((content) => `${kind.label}「${kind.describe(content)}」`);
    return [...new Set(names)];
}
