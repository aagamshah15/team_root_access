"""Shared pytest fixtures. Owner: integrator."""
from pathlib import Path

import pandas as pd
import pytest

from harvest.common import load_inputs, load_settings

FIXTURES = Path(__file__).parent / 'fixtures'


@pytest.fixture(scope='session')
def inputs():
    """Synthetic six-room inputs with a known curve (k=0.03, G50=750); see fixtures/make_fixtures.py."""
    return load_inputs(FIXTURES / 'inputs')


@pytest.fixture(scope='session')
def settings():
    return load_settings(FIXTURES / 'crop.yaml')


@pytest.fixture(scope='session')
def forecast_fixture():
    """22-day forecast for room 'fixture' as of 2024-11-06 (k=0.026, G50=746.5)."""
    df = pd.read_csv(FIXTURES / 'forecast_fixture.csv')
    df['date'] = pd.to_datetime(df['date']).dt.date
    return df
