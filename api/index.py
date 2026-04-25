from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import comments, gap, issues, overview, ranking, report, subscribers

app = FastAPI(title="Newsboard API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(overview.router, prefix="/api")
app.include_router(issues.router, prefix="/api")
app.include_router(ranking.router, prefix="/api")
app.include_router(gap.router, prefix="/api")
app.include_router(subscribers.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(report.router, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
