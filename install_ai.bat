@echo off
echo Installing PyTorch with CUDA 12.1...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
echo Installing Transformers and Audio Libraries...
pip install transformers>=4.44.0 accelerate bitsandbytes fastapi uvicorn python-multipart soundfile librosa
echo Installation Complete!
pause
