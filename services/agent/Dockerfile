FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV STORAGE_API_URL=http://storage-control-plane:80
ENV STORAGE_API_KEY=
ENV OLLAMA_URL=http://host.docker.internal:11434

CMD ["python", "agent.py"]
