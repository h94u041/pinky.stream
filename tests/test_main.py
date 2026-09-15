from pinky import main


def test_main_prints_greeting(capsys):
    main()
    assert "Hello from pinky!" in capsys.readouterr().out
