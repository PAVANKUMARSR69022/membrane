def test_contract_constants():
    from engine import config
    assert config.FPS >= 30
    assert config.CAMERA_WIDTH == 640
    assert config.CAMERA_HEIGHT == 480
    assert config.CAMERA_FOV_DEGREES == 90
    assert 73.7 < config.CAMERA_VERTICAL_FOV_DEGREES < 73.8
    assert config.MOVE_SPEED_MPS == 1
    assert config.TURN_SPEED_DPS == 90
    assert config.PICKUP_REACH_METRES == 0.5
