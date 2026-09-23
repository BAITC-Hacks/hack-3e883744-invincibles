"""Recommendation ranking and evidence, consuming A1's domain contracts."""

from .candidates import build_candidates
from .providers import (
    OllamaProvider,
    OpenAIProvider,
    PaidCallLimiter,
    ProviderError,
    RankingProvider,
)
from .service import RecommendationService

__all__ = [
    "build_candidates",
    "RecommendationService",
    "RankingProvider",
    "OpenAIProvider",
    "OllamaProvider",
    "PaidCallLimiter",
    "ProviderError",
]
