# Copyright (c) 2026 QUERIT PRIVATE LIMITED
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to
# deal in the Software without restriction, including without limitation the
# rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
# sell copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
# THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
# FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
# DEALINGS IN THE SOFTWARE.

import logging
import os

import yaml

from .generic import GenericProvider

logger = logging.getLogger(__name__)


def load_providers(file_path='providers.yaml'):
    '''
    Parses the YAML configuration file and instantiates the appropriate provider classes.

    Args:
        file_path (str): Path to the providers configuration file.

    Returns:
        dict: A dictionary mapping provider names to their initialized instances.
    '''
    if not os.path.exists(file_path):
        logger.warning(f'Provider config file not found at {file_path}')
        return {}

    with open(file_path, encoding='utf-8') as f:
        configs = yaml.safe_load(f)

    providers = {}
    for name, conf in configs.items():
        conf['name'] = name
        # All providers use the generic implementation
        providers[name] = GenericProvider(conf)

    return providers


def load_custom_providers(custom_config):
    '''
    Instantiates GenericProvider instances from custom provider definitions.

    Args:
        custom_config (dict): A dictionary mapping provider names to their
            configuration dicts, typically read from config.json under the
            'custom_providers' key.

    Returns:
        dict: A dictionary mapping provider names to their initialized instances.
    '''
    if not custom_config:
        return {}

    providers = {}
    for name, conf in custom_config.items():
        conf = dict(conf)  # shallow copy to avoid mutating stored config
        conf['name'] = name
        try:
            providers[name] = GenericProvider(conf)
        except Exception as e:
            logger.warning(f'Failed to load custom provider "{name}": {e}')

    return providers
