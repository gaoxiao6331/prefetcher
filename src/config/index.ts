import dev from "./file/dev";
import prod from "./file/prod";
import test from "./file/test";
import {
	env
} from '@/env'

const configMap = {
	development: dev,
	test: test,
	production: prod,
};

export default configMap[env] ?? prod;
