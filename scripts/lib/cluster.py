from __future__ import annotations

from math import sqrt


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (sqrt(na) * sqrt(nb))


def greedy_cluster(
    embeddings: list[list[float]],
    threshold: float = 0.80,
) -> list[list[int]]:
    """Greedy online clustering. 각 임베딩을 순회하며, 기존 centroid 중 가장 유사도가 높은 것에 속하거나
    (>= threshold) 신규 클러스터를 생성한다. centroid 는 running mean 으로 갱신."""
    clusters: list[list[int]] = []
    centroids: list[list[float]] = []

    for i, emb in enumerate(embeddings):
        best_j = -1
        best_sim = 0.0
        for j, cent in enumerate(centroids):
            s = cosine(emb, cent)
            if s > best_sim:
                best_sim = s
                best_j = j

        if best_j >= 0 and best_sim >= threshold:
            clusters[best_j].append(i)
            # running mean update
            n = len(clusters[best_j])
            centroids[best_j] = [
                c + (e - c) / n for c, e in zip(centroids[best_j], emb)
            ]
        else:
            clusters.append([i])
            centroids.append(list(emb))

    return clusters


def average_intra_cluster_similarity(
    embeddings: list[list[float]],
    group: list[int],
) -> float:
    """클러스터 내 페어 평균 cosine 유사도. 단일 기사면 1.0 반환."""
    if len(group) <= 1:
        return 1.0
    total = 0.0
    pairs = 0
    for i in range(len(group)):
        for j in range(i + 1, len(group)):
            total += cosine(embeddings[group[i]], embeddings[group[j]])
            pairs += 1
    return total / pairs if pairs > 0 else 0.0


def pick_representative(
    embeddings: list[list[float]],
    group: list[int],
) -> int:
    """클러스터 내에서 다른 멤버들과의 평균 유사도가 가장 높은 인덱스 반환 (centrality)."""
    if len(group) == 1:
        return group[0]
    best_idx = group[0]
    best_avg = -1.0
    for i in group:
        sims = [cosine(embeddings[i], embeddings[j]) for j in group if j != i]
        avg = sum(sims) / len(sims) if sims else 0.0
        if avg > best_avg:
            best_avg = avg
            best_idx = i
    return best_idx
